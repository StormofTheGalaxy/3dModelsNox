'use server';

import {
  AIError,
  type BriefClarification,
  type BriefEstimate,
  type BriefReview,
} from '@polyforge/ai';
import { prisma, type Prisma } from '@polyforge/db';
import { briefGenerateSchema, parseBriefSections } from '@polyforge/shared';

import { getCurrentUser } from '../auth/session';
import { getOwnBrief } from '../briefs';
import {
  briefChatEnabled,
  chatHistoryFor,
  listBriefChat,
  recordTurn,
  suggestionKey,
  type BriefChatTurn,
} from '../brief-chat';
import { writeAuditLog } from '../audit';
import {
  candidateDesigners,
  matchingEnabled,
  orderSections,
  type RankedDesigner,
} from '../matching';
import { refundCredits, spendCredits, type AIFeature } from '../ai/credits';
import { aiIsLive, aiProvider } from '../ai/provider';
import { checkRateLimit } from '../ratelimit';
import { managesBrief, managesOrder } from '../organizations';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * ИИ-инструменты конструктора ТЗ (§4.4).
 *
 * Общий порядок для всех фич: лимит частоты → списание кредитов → вызов
 * модели → возврат кредитов, если модель не ответила. Списывать после
 * успешного ответа нельзя: тогда провайдер уже потратил токены, а мы нет.
 */

export interface AIActionMeta {
  /** Сколько кредитов списано и сколько осталось — показывается рядом с кнопкой. */
  cost: number;
  left: number;
  /** false — работает заглушка разработки, а не модель. */
  isLive: boolean;
}

type AIGuard =
  | { ok: true; userId: string; locale: 'ru' | 'en'; cost: number; left: number }
  | { ok: false; state: ActionState };

/** Общая преамбула: права, лимит частоты и списание кредитов. */
async function guard(feature: AIFeature, target?: { type: string; id: string }): Promise<AIGuard> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) {
    return { ok: false, state: errorState('errors.forbidden') };
  }

  const limit = await checkRateLimit('ai', user.id);
  if (!limit.allowed) {
    return {
      ok: false,
      state: errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } }),
    };
  }

  const spend = await spendCredits(user.id, feature, target);
  if (!spend.ok) {
    return { ok: false, state: errorState(spend.error, { values: { left: spend.left } }) };
  }

  return { ok: true, userId: user.id, locale: user.locale, cost: spend.cost, left: spend.left };
}

function aiErrorState(error: unknown): ActionState {
  if (error instanceof AIError) {
    return errorState(error.userMessageKey);
  }
  console.error('[ai] неожиданная ошибка', error);
  return errorState('errors.ai.failed');
}

// ── «✨ Создать из описания» ────────────────────────────────────────────────

export async function generateBriefFromPrompt(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState & { briefId?: string }> {
  const parsed = briefGenerateSchema.safeParse({ prompt: formData.get('prompt') ?? '' });
  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const briefId = formData.get('briefId');
  if (typeof briefId !== 'string') return errorState('errors.generic');

  const access = await guard('brief_generate', { type: 'brief', id: briefId });
  if (!access.ok) return access.state;

  const brief = await getOwnBrief(briefId, access.userId);
  if (!brief) {
    await refundCredits(access.userId, 'brief_generate', access.cost);
    return errorState('errors.forbidden');
  }

  try {
    const provider = await aiProvider();
    const generated = await provider.generateBrief(
      { prompt: parsed.data.prompt },
      { locale: access.locale, userId: access.userId },
    );

    await prisma.brief.update({
      where: { id: briefId },
      data: {
        title: generated.title,
        sections: generated.sections as unknown as Prisma.InputJsonValue,
      },
    });

    return successState({
      message: 'brief.ai.generated',
      values: { left: access.left },
      redirectTo: `/briefs/${briefId}/edit`,
    });
  } catch (error) {
    await refundCredits(access.userId, 'brief_generate', access.cost, {
      type: 'brief',
      id: briefId,
    });
    return aiErrorState(error);
  }
}

// ── «✨ Проверить ТЗ» ───────────────────────────────────────────────────────

export async function reviewBriefWithAI(
  briefId: string,
  draft?: { title: string; sections: unknown },
): Promise<{ ok: true; review: BriefReview; meta: AIActionMeta } | { ok: false; error: string; values?: Record<string, string | number> }> {
  const access = await guard('brief_review', { type: 'brief', id: briefId });
  if (!access.ok) {
    return {
      ok: false,
      error: access.state.message ?? 'errors.generic',
      values: access.state.values,
    };
  }

  const brief = await getOwnBrief(briefId, access.userId);
  if (!brief) {
    await refundCredits(access.userId, 'brief_review', access.cost);
    return { ok: false, error: 'errors.forbidden' };
  }

  // Проверяем то, что сейчас на экране, а не последнее сохранённое:
  // иначе пользователь правит поле и получает замечание по старой версии.
  const title = draft?.title ?? brief.title;
  const sections = draft ? parseBriefSections(draft.sections) : brief.sections;

  try {
    const provider = await aiProvider();
    const review = await provider.reviewBrief(
      { title, sections },
      { locale: access.locale, userId: access.userId },
    );

    return {
      ok: true,
      review,
      meta: { cost: access.cost, left: access.left, isLive: aiIsLive() },
    };
  } catch (error) {
    await refundCredits(access.userId, 'brief_review', access.cost, { type: 'brief', id: briefId });
    const state = aiErrorState(error);
    return { ok: false, error: state.message ?? 'errors.ai.failed' };
  }
}

// ── «✨ Чат уточнений» (post-MVP №3) ────────────────────────────────────────

/**
 * Ход диалога: реплика пользователя (может быть пустой на первом ходе) —
 * и ответ модели с подсказками для полей.
 *
 * Кредиты списываются за ход модели, а не за символ: считать по репликам
 * человеку понятнее, чем по токенам, которых он не видит.
 */
export async function askBriefClarification(
  briefId: string,
  answer: string,
  draft?: { title: string; sections: unknown },
): Promise<
  | { ok: true; turns: BriefChatTurn[]; meta: AIActionMeta; done: boolean }
  | { ok: false; error: string; values?: Record<string, string | number> }
> {
  if (!(await briefChatEnabled())) return { ok: false, error: 'errors.brief.chatDisabled' };

  const text = answer.trim().slice(0, 2000);

  const access = await guard('brief_clarify', { type: 'brief', id: briefId });
  if (!access.ok) {
    return {
      ok: false,
      error: access.state.message ?? 'errors.generic',
      values: access.state.values,
    };
  }

  const brief = await getOwnBrief(briefId, access.userId);
  if (!brief) {
    await refundCredits(access.userId, 'brief_clarify', access.cost);
    return { ok: false, error: 'errors.forbidden' };
  }

  // Как и у проверки ТЗ: смотрим то, что сейчас на экране, а не последнее
  // сохранённое — иначе чат спрашивает про поле, которое только что заполнили.
  const title = draft?.title ?? brief.title;
  const sections = draft ? parseBriefSections(draft.sections) : brief.sections;

  const history = await chatHistoryFor(briefId);

  let clarification: BriefClarification;
  try {
    const provider = await aiProvider();
    clarification = await provider.clarifyBrief(
      { title, sections, history, answer: text },
      { locale: access.locale, userId: access.userId },
    );
  } catch (error) {
    await refundCredits(access.userId, 'brief_clarify', access.cost, {
      type: 'brief',
      id: briefId,
    });
    const state = aiErrorState(error);
    return { ok: false, error: state.message ?? 'errors.ai.failed' };
  }

  // Реплики записываются после успешного ответа: половина диалога в истории
  // хуже, чем его отсутствие.
  const turns: BriefChatTurn[] = [];
  if (text) turns.push(await recordTurn({ briefId, role: 'user', text }));
  turns.push(
    await recordTurn({
      briefId,
      role: 'assistant',
      text: clarification.message,
      clarification,
    }),
  );

  await writeAuditLog({
    action: 'brief.clarified',
    actorId: access.userId,
    targetType: 'brief',
    targetId: briefId,
  });

  return {
    ok: true,
    turns,
    done: clarification.done,
    meta: { cost: access.cost, left: access.left, isLive: aiIsLive() },
  };
}

/** Пометить подсказку применённой, чтобы кнопка не предлагала её снова. */
export async function markClarificationApplied(
  messageId: string,
  section: string,
  field: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const message = await prisma.briefChatMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      appliedFields: true,
      brief: { select: { ownerId: true, organizationId: true } },
    },
  });

  if (!message || !(await managesBrief(message.brief, user.id))) return { ok: false };

  const key = suggestionKey({ section, field });
  if (message.appliedFields.includes(key)) return { ok: true };

  await prisma.briefChatMessage.update({
    where: { id: message.id },
    data: { appliedFields: { push: key } },
  });

  return { ok: true };
}

/** История диалога для первой отрисовки панели. */
export async function loadBriefChat(
  briefId: string,
): Promise<{ ok: true; turns: BriefChatTurn[] } | { ok: false }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    select: { ownerId: true, organizationId: true },
  });

  if (!brief || !(await managesBrief(brief, user.id))) return { ok: false };

  return { ok: true, turns: await listBriefChat(briefId) };
}

// ── «✨ Подобрать исполнителей» (post-MVP №4) ───────────────────────────────

/**
 * Подбор дизайнеров под заказ.
 *
 * Кандидатов отбирает запрос по тегам — модель только упорядочивает готовый
 * список и объясняет выбор. Без флага и без кредитов подбор всё равно
 * работает: возвращается тот же список, отсортированный баллом совпадения.
 */
export async function matchDesignersForOrder(
  orderId: string,
): Promise<
  | { ok: true; designers: RankedDesigner[]; explained: boolean; meta?: AIActionMeta }
  | { ok: false; error: string; values?: Record<string, string | number> }
> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  const owner = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, organizationId: true },
  });

  if (!owner || !(await managesOrder(owner, user.id))) {
    return { ok: false, error: 'errors.forbidden' };
  }

  const found = await candidateDesigners(orderId);
  if (!found) return { ok: false, error: 'errors.notFound' };

  const byTags: RankedDesigner[] = found.candidates.map((candidate) => ({
    ...candidate,
    score: candidate.tagScore,
    reason: '',
  }));

  // Флаг выключен или кандидатов нет — отдаём подбор по тегам. Он не хуже
  // пустого экрана и не стоит кредитов.
  if (!(await matchingEnabled()) || byTags.length === 0) {
    return { ok: true, designers: byTags, explained: false };
  }

  const access = await guard('match_designers', { type: 'order', id: orderId });
  if (!access.ok) {
    // Кредиты кончились — это не повод не показать подбор по тегам.
    return { ok: true, designers: byTags, explained: false };
  }

  try {
    const provider = await aiProvider();
    const ranking = await provider.rankMatches(
      {
        title: found.order.title,
        sections: orderSections(found.order.sections),
        budgetAmount: found.order.budgetAmount,
        currency: found.order.currency,
        candidates: found.candidates.map((candidate) => ({
          id: candidate.id,
          nickname: candidate.nickname,
          level: candidate.level,
          rating: candidate.rating,
          ratingCount: candidate.ratingCount,
          ordersCompleted: candidate.ordersCompleted,
          onTimePct: candidate.onTimePct,
          specializations: candidate.specializations,
          styles: candidate.styles,
          engines: candidate.engines,
          software: candidate.software,
          minBudget: candidate.minBudget,
          currency: candidate.currency,
          // Длинное био раздувает запрос, а решает первая пара фраз.
          bio: candidate.bio.slice(0, 300),
        })),
      },
      { locale: access.locale, userId: access.userId },
    );

    const byId = new Map(byTags.map((candidate) => [candidate.id, candidate]));
    const designers = ranking.items.flatMap((item) => {
      const candidate = byId.get(item.id);
      return candidate ? [{ ...candidate, score: item.score, reason: item.reason }] : [];
    });

    return {
      ok: true,
      designers,
      explained: true,
      meta: { cost: access.cost, left: access.left, isLive: aiIsLive() },
    };
  } catch (error) {
    await refundCredits(access.userId, 'match_designers', access.cost, {
      type: 'order',
      id: orderId,
    });
    // Модель не ответила — подбор по тегам всё равно есть.
    console.error('[ai] подбор исполнителей не удался', error);
    return { ok: true, designers: byTags, explained: false };
  }
}

// ── «✨ Оценка бюджета и сроков» ────────────────────────────────────────────

export async function estimateBriefWithAI(
  briefId: string,
  draft?: { title: string; sections: unknown },
): Promise<{ ok: true; estimate: BriefEstimate; meta: AIActionMeta } | { ok: false; error: string; values?: Record<string, string | number> }> {
  const access = await guard('estimate', { type: 'brief', id: briefId });
  if (!access.ok) {
    return {
      ok: false,
      error: access.state.message ?? 'errors.generic',
      values: access.state.values,
    };
  }

  const brief = await getOwnBrief(briefId, access.userId);
  if (!brief) {
    await refundCredits(access.userId, 'estimate', access.cost);
    return { ok: false, error: 'errors.forbidden' };
  }

  const title = draft?.title ?? brief.title;
  const sections = draft ? parseBriefSections(draft.sections) : brief.sections;

  try {
    const provider = await aiProvider();
    const estimate = await provider.estimateBudget(
      { title, sections, currency: sections.terms.budgetCurrency },
      { locale: access.locale, userId: access.userId },
    );

    return {
      ok: true,
      estimate,
      meta: { cost: access.cost, left: access.left, isLive: aiIsLive() },
    };
  } catch (error) {
    await refundCredits(access.userId, 'estimate', access.cost, { type: 'brief', id: briefId });
    const state = aiErrorState(error);
    return { ok: false, error: state.message ?? 'errors.ai.failed' };
  }
}

// ── Подсказка в поле ────────────────────────────────────────────────────────

export async function suggestBriefField(
  briefId: string,
  section: string,
  field: string,
  draft?: { title: string; sections: unknown },
): Promise<{ ok: true; value: string; explanation: string; meta: AIActionMeta } | { ok: false; error: string }> {
  const access = await guard('field_hint', { type: 'brief', id: briefId });
  if (!access.ok) {
    return { ok: false, error: access.state.message ?? 'errors.generic' };
  }

  const brief = await getOwnBrief(briefId, access.userId);
  if (!brief) {
    await refundCredits(access.userId, 'field_hint', access.cost);
    return { ok: false, error: 'errors.forbidden' };
  }

  const title = draft?.title ?? brief.title;
  const sections = draft ? parseBriefSections(draft.sections) : brief.sections;

  try {
    const provider = await aiProvider();
    const suggestion = await provider.suggestField(
      { section, field, title, sections },
      { locale: access.locale, userId: access.userId },
    );

    return {
      ok: true,
      value: suggestion.value,
      explanation: suggestion.explanation,
      meta: { cost: access.cost, left: access.left, isLive: aiIsLive() },
    };
  } catch (error) {
    await refundCredits(access.userId, 'field_hint', access.cost, { type: 'brief', id: briefId });
    const state = aiErrorState(error);
    return { ok: false, error: state.message ?? 'errors.ai.failed' };
  }
}

'use server';

import { revalidatePath } from 'next/cache';

import { prisma, type Prisma } from '@polyforge/db';
import {
  REALTIME_CHANNELS,
  briefChangeRequestSchema,
  chatMessageSchema,
  type Locale,
} from '@polyforge/shared';

import { aiProvider } from '../ai/provider';
import { spendCredits, refundCredits } from '../ai/credits';
import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { getDealForUser, postSystemMessage } from '../deals';
import { storeDealFile, type StoredDealFile } from '../media';
import { notify } from '../notifications';
import { checkRateLimit } from '../ratelimit';
import { redis } from '../redis';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Чат сделки (§4.7).
 *
 * Одна лента на сделку: реплики сторон и системные события идут вперемешку
 * в хронологии — только так по переписке можно восстановить, что произошло,
 * когда дело доходит до спора.
 */

/** Доставка сообщения в открытые вкладки. Не критична: БД уже источник правды. */
async function publishMessage(dealId: string, recipients: string[], payload: unknown) {
  try {
    await redis.publish(
      REALTIME_CHANNELS.message,
      JSON.stringify({ room: `deal:${dealId}`, userIds: recipients, type: 'message', payload }),
    );
  } catch {
    // Реалтайм лежит — сообщение всё равно появится при перезагрузке.
  }
}

export async function sendDealMessage(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const dealId = String(formData.get('dealId') ?? '');
  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const text = String(formData.get('text') ?? '').trim();
  // Вложение без подписи — нормальное сообщение, текст в этом случае не нужен.
  if (!text && files.length === 0) return errorState('errors.deal.messageEmpty');

  const parsed = chatMessageSchema.safeParse({
    text: text || '—',
    quotedMessageId: String(formData.get('quotedMessageId') ?? '') || undefined,
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const access = await getDealForUser(dealId, user.id);
  if (!access || access.role === 'staff') return errorState('errors.forbidden');

  const limit = await checkRateLimit('message', user.id);
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  const stored: StoredDealFile[] = [];
  for (const file of files) {
    const result = await storeDealFile(file, 'chat', user.id, { withPreview: true });
    if (!result.ok) return errorState(result.error, { values: result.values });
    stored.push(result.file);
  }

  // Автоперевод исходящих (§4.7): собеседник получает перевод сразу,
  // а оригинал остаётся рядом — так видно, что именно было сказано.
  let translatedText: Prisma.InputJsonValue | undefined;

  if (text && user.translateOutgoing) {
    const otherLocale = await counterpartLocale(dealId, user.id);

    if (otherLocale && otherLocale !== user.locale) {
      const translation = await translateOutgoing(text, otherLocale, user.id, user.locale);
      if (translation) translatedText = { [otherLocale]: translation };
    }
  }

  const message = await prisma.dealMessage.create({
    data: {
      dealId,
      kind: 'user',
      authorId: user.id,
      text: text || '',
      ...(translatedText ? { translatedText } : {}),
      quotedMessageId: parsed.data.quotedMessageId ?? null,
      // Своё сообщение автор прочитал по определению.
      ...(access.role === 'customer'
        ? { readByCustomerAt: new Date() }
        : { readByDesignerAt: new Date() }),
      attachments: {
        create: stored.map((file) => ({
          storageKey: file.storageKey,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          previewUrl: file.previewUrl,
        })),
      },
    },
    select: {
      id: true,
      text: true,
      createdAt: true,
      authorId: true,
      quotedMessageId: true,
      attachments: { select: { id: true, fileName: true, mimeType: true, previewUrl: true } },
    },
  });

  const other =
    access.role === 'customer' ? access.deal.designerId : access.deal.customerId;

  await publishMessage(dealId, [other], {
    ...message,
    author: { nickname: user.nickname },
    kind: 'user',
  });

  await notify({
    userId: other,
    type: 'deal_message',
    payload: { dealTitle: access.deal.title, author: user.nickname },
    link: `/deals/${dealId}`,
  });

  revalidatePath(`/deals/${dealId}`);
  return successState();
}

/** Язык второй стороны сделки — на него переводятся исходящие. */
async function counterpartLocale(dealId: string, authorId: string): Promise<Locale | null> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      customer: { select: { id: true, locale: true } },
      designer: { select: { id: true, locale: true } },
    },
  });

  if (!deal) return null;

  const other = deal.customer.id === authorId ? deal.designer : deal.customer;
  return other.locale as Locale;
}

/** Перевод исходящего сообщения. Ошибка модели не должна отменять отправку. */
async function translateOutgoing(
  text: string,
  targetLocale: Locale,
  userId: string,
  viewerLocale: Locale,
): Promise<string | null> {
  const spend = await spendCredits(userId, 'translate_msg', { type: 'message', id: 'outgoing' });
  if (!spend.ok) return null;

  try {
    const provider = await aiProvider();
    return await provider.translate({ text, targetLocale }, { locale: viewerLocale, userId });
  } catch (error) {
    console.error('[deal-chat] автоперевод исходящего не удался', error);
    await refundCredits(userId, 'translate_msg', spend.cost);
    return null;
  }
}

/** Отметка прочтения: двигает только свою сторону. */
export async function markDealRead(dealId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const access = await getDealForUser(dealId, user.id);
  if (!access || access.role === 'staff') return { ok: false };

  const field = access.role === 'customer' ? 'readByCustomerAt' : 'readByDesignerAt';

  await prisma.dealMessage.updateMany({
    where: { dealId, [field]: null },
    data: { [field]: new Date() },
  });

  return { ok: true };
}

/**
 * Закрепление сообщения. Закрепляют обычно договорённость, которой нет в ТЗ, —
 * поэтому право есть у обеих сторон, а не только у автора.
 */
export async function toggleMessagePin(messageId: string): Promise<{ ok: boolean; pinned?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const message = await prisma.dealMessage.findUnique({
    where: { id: messageId },
    select: { id: true, dealId: true, pinned: true },
  });

  if (!message?.dealId) return { ok: false };

  const access = await getDealForUser(message.dealId, user.id);
  if (!access || access.role === 'staff') return { ok: false };

  await prisma.dealMessage.update({
    where: { id: message.id },
    data: { pinned: !message.pinned },
  });

  revalidatePath(`/deals/${message.dealId}`);
  return { ok: true, pinned: !message.pinned };
}

/**
 * Перевод реплики на язык читателя (§4.7).
 *
 * Результат кэшируется в самом сообщении: один и тот же текст не должен
 * оплачиваться кредитами дважды, а собеседники читают его на разных языках.
 */
export async function translateDealMessage(
  messageId: string,
  targetLocale: Locale,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const message = await prisma.dealMessage.findUnique({
    where: { id: messageId },
    select: { id: true, dealId: true, text: true, translatedText: true },
  });

  if (!message?.dealId || !message.text) return { ok: false, error: 'errors.notFound' };

  const access = await getDealForUser(message.dealId, user.id);
  if (!access) return { ok: false, error: 'errors.forbidden' };

  const cache = (message.translatedText ?? {}) as Record<string, string>;
  const cached = cache[targetLocale];
  if (cached) return { ok: true, text: cached };

  const spend = await spendCredits(user.id, 'translate_msg', {
    type: 'message',
    id: message.id,
  });
  if (!spend.ok) return { ok: false, error: spend.error };

  try {
    const provider = await aiProvider();
    const text = await provider.translate(
      { text: message.text, targetLocale },
      { locale: user.locale, userId: user.id },
    );

    await prisma.dealMessage.update({
      where: { id: message.id },
      data: { translatedText: { ...cache, [targetLocale]: text } as Prisma.InputJsonValue },
    });

    return { ok: true, text };
  } catch (error) {
    console.error('[deal-chat] перевод не удался', error);
    await refundCredits(user.id, 'translate_msg', spend.cost, { type: 'message', id: message.id });
    return { ok: false, error: 'errors.ai.unavailable' };
  }
}

/**
 * Пакетный перевод входящих сообщений (§4.7).
 *
 * Вызывается, когда у читателя включено «Переводить входящие»: переводить
 * по одному сообщению значило бы дёргать модель на каждый рендер ленты.
 * Уже переведённое берётся из кэша в самом сообщении и кредитов не стоит.
 */
export async function translateIncomingMessages(
  dealId: string,
  targetLocale: Locale,
): Promise<{ ok: boolean; translations?: Record<string, string>; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const access = await getDealForUser(dealId, user.id);
  if (!access) return { ok: false, error: 'errors.forbidden' };

  const messages = await prisma.dealMessage.findMany({
    where: { dealId, kind: 'user', authorId: { not: user.id }, text: { not: '' } },
    orderBy: { createdAt: 'desc' },
    // Хвост ленты: старые реплики читатель уже видел переведёнными.
    take: 50,
    select: { id: true, text: true, translatedText: true },
  });

  const translations: Record<string, string> = {};
  const pending: { id: string; text: string; cache: Record<string, string> }[] = [];

  for (const message of messages) {
    const cache = (message.translatedText ?? {}) as Record<string, string>;
    const cached = cache[targetLocale];

    if (cached) {
      translations[message.id] = cached;
      continue;
    }

    pending.push({ id: message.id, text: message.text, cache });
  }

  if (pending.length === 0) return { ok: true, translations };

  const provider = await aiProvider();

  for (const message of pending) {
    const spend = await spendCredits(user.id, 'translate_msg', {
      type: 'message',
      id: message.id,
    });
    // Кредиты кончились — отдаём, что успели: часть ленты лучше, чем ничего.
    if (!spend.ok) break;

    try {
      const text = await provider.translate(
        { text: message.text, targetLocale },
        { locale: user.locale, userId: user.id },
      );

      await prisma.dealMessage.update({
        where: { id: message.id },
        data: {
          translatedText: { ...message.cache, [targetLocale]: text } as Prisma.InputJsonValue,
        },
      });

      translations[message.id] = text;
    } catch (error) {
      console.error('[deal-chat] перевод входящего не удался', error);
      await refundCredits(user.id, 'translate_msg', spend.cost, {
        type: 'message',
        id: message.id,
      });
      break;
    }
  }

  return { ok: true, translations };
}

/**
 * «✨ Саммари чата» (§4.7): договорённости и решения из переписки.
 *
 * Результат сохраняется: пока новых сообщений нет, повторное нажатие ничего
 * не меняет, а кредиты тратит.
 */
export async function summarizeDealChat(
  dealId: string,
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const access = await getDealForUser(dealId, user.id);
  if (!access) return { ok: false, error: 'errors.forbidden' };

  const messages = await prisma.dealMessage.findMany({
    where: { dealId, kind: 'user', text: { not: '' } },
    orderBy: { createdAt: 'asc' },
    take: 300,
    select: { text: true, author: { select: { nickname: true } } },
  });

  if (messages.length < 2) return { ok: false, error: 'errors.ai.notEnoughMessages' };

  const existing = await prisma.chatSummary.findUnique({
    where: { dealId },
    select: { text: true, messageCount: true },
  });

  if (existing && existing.messageCount === messages.length) {
    return { ok: true, summary: existing.text };
  }

  const spend = await spendCredits(user.id, 'chat_summary', { type: 'deal', id: dealId });
  if (!spend.ok) return { ok: false, error: spend.error };

  try {
    const provider = await aiProvider();
    const summary = await provider.summarizeChat(
      {
        messages: messages.map((message) => ({
          author: message.author?.nickname ?? 'user',
          text: message.text,
        })),
      },
      { locale: user.locale, userId: user.id },
    );

    await prisma.chatSummary.upsert({
      where: { dealId },
      create: { dealId, text: summary, messageCount: messages.length },
      update: { text: summary, messageCount: messages.length },
    });

    return { ok: true, summary };
  } catch (error) {
    console.error('[deal-chat] саммари чата не собралось', error);
    await refundCredits(user.id, 'chat_summary', spend.cost, { type: 'deal', id: dealId });
    return { ok: false, error: 'errors.ai.unavailable' };
  }
}

/**
 * Запрос изменения замороженного ТЗ (§4.4).
 *
 * После старта сделки ТЗ правится только по согласию обеих сторон — иначе
 * снимок, на который дизайнер соглашался, теряет смысл.
 */
export async function requestBriefChange(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const parsed = briefChangeRequestSchema.safeParse({
    dealId: formData.get('dealId') ?? '',
    description: formData.get('description') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const access = await getDealForUser(parsed.data.dealId, user.id);
  if (!access || access.role === 'staff') return errorState('errors.forbidden');

  const { deal } = access;

  await prisma.briefChangeRequest.create({
    data: {
      briefId: deal.briefVersion.briefId,
      dealId: deal.id,
      authorId: user.id,
      description: parsed.data.description,
    },
  });

  await postSystemMessage(deal.id, 'brief.changeRequested', { author: user.nickname });

  const other = access.role === 'customer' ? deal.designerId : deal.customerId;
  await notify({
    userId: other,
    type: 'deal_brief_change',
    payload: { dealTitle: deal.title, author: user.nickname },
    link: `/deals/${deal.id}`,
    push: true,
  });

  await writeAuditLog({
    action: 'brief.change_requested',
    actorId: user.id,
    targetType: 'brief',
    targetId: deal.briefVersion.briefId,
    payload: { dealId: deal.id },
  });

  revalidatePath(`/deals/${deal.id}`);
  return successState({ message: 'deals.briefChange.sent' });
}

/** Ответ второй стороны на запрос изменения ТЗ. */
export async function resolveBriefChange(
  requestId: string,
  accept: boolean,
  note = '',
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const request = await prisma.briefChangeRequest.findUnique({
    where: { id: requestId },
    select: { id: true, dealId: true, authorId: true, status: true },
  });

  if (!request?.dealId) return { ok: false, error: 'errors.notFound' };
  if (request.status !== 'pending') return { ok: false, error: 'errors.deal.changeResolved' };
  // Свой же запрос подтверждать нельзя: смысл согласования в второй стороне.
  if (request.authorId === user.id) return { ok: false, error: 'errors.forbidden' };

  const access = await getDealForUser(request.dealId, user.id);
  if (!access || access.role === 'staff') return { ok: false, error: 'errors.forbidden' };

  await prisma.briefChangeRequest.update({
    where: { id: request.id },
    data: {
      status: accept ? 'accepted' : 'rejected',
      resolvedById: user.id,
      resolvedAt: new Date(),
      resolutionNote: note.slice(0, 1000) || null,
    },
  });

  await postSystemMessage(access.deal.id, 'brief.changeResolved', {
    author: user.nickname,
    accepted: accept ? 1 : 0,
  });

  await notify({
    userId: request.authorId ?? access.deal.customerId,
    type: 'deal_brief_change',
    payload: { dealTitle: access.deal.title, author: user.nickname },
    link: `/deals/${access.deal.id}`,
  });

  await writeAuditLog({
    action: 'brief.change_resolved',
    actorId: user.id,
    targetType: 'brief',
    targetId: request.id,
    payload: { accepted: accept },
  });

  revalidatePath(`/deals/${access.deal.id}`);
  return { ok: true };
}

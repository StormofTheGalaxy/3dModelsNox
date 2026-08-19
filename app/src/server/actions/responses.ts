'use server';

import { revalidatePath } from 'next/cache';

import { AIError } from '@polyforge/ai';
import { prisma } from '@polyforge/db';
import { RESPONSE_REJECT_REASONS, responseSchema } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { refundCredits, spendCredits } from '../ai/credits';
import { aiProvider } from '../ai/provider';
import { createDealFromResponse } from './deals';
import { notify } from '../notifications';
import { managesOrder } from '../organizations';
import { checkRateLimit } from '../ratelimit';
import { responsesLeftToday } from '../responses';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Отклики на заказы (§4.5).
 */

export async function submitResponse(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  let attachedWorkIds: string[] = [];
  try {
    const raw: unknown = JSON.parse(String(formData.get('attachedWorkIds') ?? '[]'));
    attachedWorkIds = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    attachedWorkIds = [];
  }

  const parsed = responseSchema.safeParse({
    orderId: formData.get('orderId') ?? '',
    coverText: formData.get('coverText') ?? '',
    price: Number(formData.get('price') ?? 0),
    currency: formData.get('currency') ?? 'USD',
    days: Number(formData.get('days') ?? 0),
    attachedWorkIds,
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const input = parsed.data;

  const limit = await checkRateLimit('response', user.id);
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  const profile = await prisma.designerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) return errorState('errors.response.designerProfileRequired');

  // Дневной лимит откликов зависит от уровня дизайнера (§4.5).
  const quota = await responsesLeftToday(user.id);
  if (quota.left <= 0) {
    return errorState('errors.response.dailyLimit', { values: { limit: quota.limit } });
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      title: true,
      status: true,
      customerId: true,
      organizationId: true,
      invitedDesignerIds: true,
    },
  });

  if (!order || order.status !== 'published') return errorState('errors.order.notPublished');
  // Откликаться на свой заказ нельзя — и менеджеру команды тоже (§1.4).
  if (await managesOrder(order, user.id)) return errorState('errors.response.ownOrder');

  // Прикреплять можно только свои работы.
  const ownWorks = await prisma.portfolioWork.findMany({
    where: { id: { in: input.attachedWorkIds }, designerId: user.id },
    select: { id: true },
  });

  if (ownWorks.length !== input.attachedWorkIds.length) {
    return errorState('errors.generic', {
      fieldErrors: { attachedWorkIds: 'errors.response.worksRequired' },
    });
  }

  const existing = await prisma.orderResponse.findUnique({
    where: { orderId_designerId: { orderId: order.id, designerId: user.id } },
    select: { id: true },
  });

  if (existing) return errorState('errors.response.alreadySent');

  await prisma.$transaction([
    prisma.orderResponse.create({
      data: {
        orderId: order.id,
        designerId: user.id,
        coverText: input.coverText,
        price: input.price,
        currency: input.currency,
        days: input.days,
        attachedWorkIds: input.attachedWorkIds,
        isInvited: order.invitedDesignerIds.includes(user.id),
      },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { responsesCount: { increment: 1 }, lastActivityAt: new Date() },
    }),
  ]);

  await notify({
    userId: order.customerId,
    type: 'order_response_received',
    payload: { orderTitle: order.title, designer: user.nickname },
    link: `/orders/${order.id}/responses`,
    push: true,
  });

  await writeAuditLog({
    action: 'response.submitted',
    actorId: user.id,
    targetType: 'order',
    targetId: order.id,
  });

  revalidatePath(`/orders/${order.id}`);

  return successState({ message: 'orders.response.sent', redirectTo: `/orders/${order.id}` });
}

/** Заказчик открыл отклик — фиксируем для метрики отзывчивости. */
export async function markResponseViewed(responseId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const response = await prisma.orderResponse.findUnique({
    where: { id: responseId },
    select: {
      status: true,
      viewedAt: true,
      order: { select: { customerId: true, organizationId: true } },
    },
  });

  if (!response || !(await managesOrder(response.order, user.id))) return { ok: false };
  if (response.viewedAt) return { ok: true };

  await prisma.orderResponse.update({
    where: { id: responseId },
    data: {
      viewedAt: new Date(),
      // «Просмотрен» не затирает шортлист и отказ — только исходное «новый».
      ...(response.status === 'new' ? { status: 'viewed' as const } : {}),
    },
  });

  return { ok: true };
}

/** Смена статуса отклика заказчиком: шортлист, отказ, принятие. */
export async function setResponseStatus(
  responseId: string,
  status: string,
  rejectReason?: string,
): Promise<{ ok: boolean; error?: string; dealId?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!['viewed', 'shortlist', 'rejected', 'accepted'].includes(status)) {
    return { ok: false, error: 'errors.generic' };
  }

  const response = await prisma.orderResponse.findUnique({
    where: { id: responseId },
    select: {
      id: true,
      designerId: true,
      orderId: true,
      order: { select: { customerId: true, organizationId: true, title: true, status: true } },
    },
  });

  if (!response || !(await managesOrder(response.order, user.id))) {
    return { ok: false, error: 'errors.forbidden' };
  }

  const reason =
    status === 'rejected' && rejectReason && (RESPONSE_REJECT_REASONS as readonly string[]).includes(rejectReason)
      ? (rejectReason as (typeof RESPONSE_REJECT_REASONS)[number])
      : null;

  await prisma.orderResponse.update({
    where: { id: responseId },
    data: {
      status: status as 'viewed' | 'shortlist' | 'rejected' | 'accepted',
      rejectReason: reason,
      viewedAt: new Date(),
    },
  });

  // Принятие отклика запускает сделку (§4.6). Заказ уходит с витрины, чтобы
  // не собирать новые отклики, а стороны переходят к согласованию плана.
  let dealId: string | undefined;

  if (status === 'accepted') {
    await prisma.order.update({
      where: { id: response.orderId },
      data: { status: 'in_progress', lastActivityAt: new Date() },
    });

    const deal = await createDealFromResponse(responseId);
    if ('dealId' in deal) dealId = deal.dealId;
  }

  // Про созданную сделку дизайнер уже уведомлён ссылкой на неё —
  // второе письмо про тот же факт только путает.
  if (!dealId) {
    await notify({
      userId: response.designerId,
      type: status === 'accepted' ? 'response_accepted' : 'response_status_changed',
      payload: { orderTitle: response.order.title, status },
      link: `/orders/${response.orderId}`,
      push: status === 'accepted',
    });
  }

  await writeAuditLog({
    action: status === 'accepted' ? 'response.accepted' : 'response.rejected',
    actorId: user.id,
    targetType: 'response',
    targetId: responseId,
    payload: { status, reason },
  });

  revalidatePath(`/orders/${response.orderId}/responses`);

  return { ok: true, dealId };
}

/**
 * «✨ Улучшить текст» отклика (§4.5).
 *
 * Модель правит грамотность и структуру написанного, но не пишет с нуля —
 * это прямо оговорено в ТЗ, поэтому пустой текст сюда не пропускается.
 */
export async function improveResponseText(
  text: string,
): Promise<{ ok: true; text: string; left: number } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  if (text.trim().length < 30) {
    return { ok: false, error: 'errors.response.coverTooShort' };
  }

  const limit = await checkRateLimit('ai', user.id);
  if (!limit.allowed) return { ok: false, error: 'errors.rateLimited' };

  const spend = await spendCredits(user.id, 'improve_text');
  if (!spend.ok) return { ok: false, error: spend.error };

  try {
    const provider = await aiProvider();
    const improved = await provider.improveText(
      { text, kind: 'response' },
      { locale: user.locale, userId: user.id },
    );

    return { ok: true, text: improved, left: spend.left };
  } catch (error) {
    await refundCredits(user.id, 'improve_text', spend.cost);
    return {
      ok: false,
      error: error instanceof AIError ? error.userMessageKey : 'errors.ai.failed',
    };
  }
}

'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { disputeOpenSchema, disputeResolveSchema } from '@polyforge/shared';

import { aiProvider } from '../ai/provider';
import { writeAuditLog } from '../audit';
import { getCurrentUser, isStaff } from '../auth/session';
import { getDealForUser, listDealMessages, postSystemMessage } from '../deals';
import { notify } from '../notifications';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Споры (§4.6).
 *
 * Платформа не возвращает деньги — она их не держит. Арбитр фиксирует, кто
 * прав, и вердикт влияет только на репутацию и статистику сторон. Поэтому
 * важнее всего сохранить материал спора: сделка замораживается, переписка
 * и версии сдач остаются нетронутыми.
 */

export async function openDispute(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const parsed = disputeOpenSchema.safeParse({
    dealId: formData.get('dealId') ?? '',
    reason: formData.get('reason') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const access = await getDealForUser(parsed.data.dealId, user.id);
  if (!access || access.role === 'staff') return errorState('errors.forbidden');

  const { deal } = access;
  if (deal.dispute) return errorState('errors.deal.disputeExists');
  if (deal.status === 'completed' || deal.status === 'cancelled') {
    return errorState('errors.deal.alreadyClosed');
  }

  await prisma.$transaction(async (tx) => {
    await tx.dispute.create({
      data: { dealId: deal.id, openedById: user.id, reason: parsed.data.reason },
    });

    // Заморозка: пока идёт спор, ни сдать, ни принять, ни оплатить нельзя.
    await tx.deal.update({ where: { id: deal.id }, data: { status: 'in_dispute' } });
  });

  await postSystemMessage(deal.id, 'dispute.opened', { author: user.nickname });

  const other = access.role === 'customer' ? deal.designerId : deal.customerId;
  await notify({
    userId: other,
    type: 'dispute_opened',
    payload: { dealTitle: deal.title },
    link: `/deals/${deal.id}`,
    push: true,
  });

  await writeAuditLog({
    action: 'dispute.opened',
    actorId: user.id,
    targetType: 'deal',
    targetId: deal.id,
    payload: { reason: parsed.data.reason.slice(0, 200) },
  });

  revalidatePath(`/deals/${deal.id}`);
  return successState({ message: 'deals.dispute.opened' });
}

/**
 * Саммари переписки для арбитра.
 *
 * Кредиты не списываются: это инструмент модерации, а не пользователя,
 * и стоимость разбора несёт платформа.
 */
export async function summarizeDispute(
  disputeId: string,
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return { ok: false, error: 'errors.forbidden' };

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, dealId: true, reason: true, status: true },
  });

  if (!dispute) return { ok: false, error: 'errors.notFound' };

  const messages = await listDealMessages(dispute.dealId, 300);
  const dialogue = messages
    .filter((message) => message.kind === 'user' && message.text)
    .map((message) => ({ author: message.author?.nickname ?? 'user', text: message.text }));

  try {
    const provider = await aiProvider();
    const summary = await provider.summarizeDispute(
      { messages: [{ author: 'reason', text: dispute.reason }, ...dialogue] },
      { locale: user.locale, userId: user.id },
    );

    await prisma.dispute.update({ where: { id: dispute.id }, data: { aiSummary: summary } });

    revalidatePath(`/admin/disputes/${dispute.id}`);
    return { ok: true, summary };
  } catch (error) {
    console.error('[disputes] саммари не собралось', error);
    return { ok: false, error: 'errors.ai.unavailable' };
  }
}

/**
 * Вердикт арбитра. Сделка возвращается в работу или закрывается —
 * в зависимости от того, есть ли что доводить до конца.
 */
export async function resolveDispute(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return errorState('errors.forbidden');

  const parsed = disputeResolveSchema.safeParse({
    disputeId: formData.get('disputeId') ?? '',
    verdict: formData.get('verdict') ?? '',
    resolutionNote: formData.get('resolutionNote') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id: parsed.data.disputeId },
    select: {
      id: true,
      status: true,
      deal: {
        select: {
          id: true,
          title: true,
          customerId: true,
          designerId: true,
          milestones: { select: { status: true } },
        },
      },
    },
  });

  if (!dispute) return errorState('errors.notFound');
  if (dispute.status === 'resolved') return errorState('errors.deal.disputeResolved');

  // Если по сделке ещё остались незакрытые этапы, работа продолжается;
  // если всё оплачено, спор был про финал — сделка закрывается.
  const openMilestones = dispute.deal.milestones.some(
    (milestone) => milestone.status !== 'paid_confirmed',
  );

  await prisma.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: 'resolved',
        verdict: parsed.data.verdict,
        resolutionNote: parsed.data.resolutionNote,
        arbiterId: user.id,
        resolvedAt: new Date(),
      },
    });

    await tx.deal.update({
      where: { id: dispute.deal.id },
      data: openMilestones
        ? { status: 'active' }
        : { status: 'completed', completedAt: new Date() },
    });

    // Репутационное последствие (§4.6): проигравшей стороне засчитывается
    // проигранный спор. Деньги платформа не двигает — их у неё нет.
    if (parsed.data.verdict === 'designer_right') {
      await tx.customerProfile.updateMany({
        where: { userId: dispute.deal.customerId },
        data: { disputesLost: { increment: 1 } },
      });
    } else if (parsed.data.verdict === 'customer_right') {
      await tx.designerProfile.updateMany({
        where: { userId: dispute.deal.designerId },
        data: { disputesLost: { increment: 1 } },
      });
    }
  });

  await postSystemMessage(dispute.deal.id, 'dispute.resolved', { verdict: parsed.data.verdict });

  for (const userId of [dispute.deal.customerId, dispute.deal.designerId]) {
    await notify({
      userId,
      type: 'dispute_resolved',
      payload: { dealTitle: dispute.deal.title, verdict: parsed.data.verdict },
      link: `/deals/${dispute.deal.id}`,
      push: true,
    });
  }

  await writeAuditLog({
    action: 'dispute.resolved',
    actorId: user.id,
    targetType: 'dispute',
    targetId: dispute.id,
    payload: { verdict: parsed.data.verdict },
  });

  revalidatePath(`/deals/${dispute.deal.id}`);
  revalidatePath('/admin/disputes');
  return successState({ message: 'deals.dispute.resolved' });
}

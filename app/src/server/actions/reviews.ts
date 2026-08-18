'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { reviewReplySchema, reviewSchema } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser, isStaff } from '../auth/session';
import { getDealForUser, postSystemMessage } from '../deals';
import { notify } from '../notifications';
import { publishDealReviews } from '../reviews';
import { grantAchievements, recomputeLevel, recomputeRating } from '../reputation';
import { getSettings } from '../settings';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom, numberField } from './form';

/**
 * Отзывы (§4.8).
 *
 * Анти-накрутка встроена в само условие создания: отзыв пишется только из
 * завершённой сделки, а сделка завершается только подтверждённой оплатой
 * финального этапа. Купить отзыв «просто так» на платформе не за что.
 */

export async function submitReview(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const parsed = reviewSchema.safeParse({
    dealId: formData.get('dealId') ?? '',
    overall: numberField(formData.get('overall')) ?? 0,
    sub1: numberField(formData.get('sub1')) ?? 0,
    sub2: numberField(formData.get('sub2')) ?? 0,
    sub3: numberField(formData.get('sub3')) ?? 0,
    text: formData.get('text') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const access = await getDealForUser(parsed.data.dealId, user.id);
  if (!access || access.role === 'staff') return errorState('errors.forbidden');

  const { deal, role } = access;
  if (deal.status !== 'completed') return errorState('errors.review.dealNotCompleted');

  const existing = await prisma.review.findUnique({
    where: { dealId_authorId: { dealId: deal.id, authorId: user.id } },
    select: { id: true },
  });
  if (existing) return errorState('errors.review.alreadyLeft');

  const { review_blind_days, review_edit_hours } = await getSettings([
    'review_blind_days',
    'review_edit_hours',
  ]);

  const targetId = role === 'customer' ? deal.designerId : deal.customerId;
  const targetRole = role === 'customer' ? 'designer' : 'customer';

  await prisma.review.create({
    data: {
      dealId: deal.id,
      authorId: user.id,
      targetId,
      targetRole,
      overall: parsed.data.overall,
      sub1: parsed.data.sub1,
      sub2: parsed.data.sub2,
      sub3: parsed.data.sub3,
      text: parsed.data.text,
      editableUntil: new Date(Date.now() + review_edit_hours * 3_600_000),
    },
  });

  // Обе стороны высказались — публикуем пару сразу, не дожидаясь срока.
  const counterpart = await prisma.review.findFirst({
    where: { dealId: deal.id, authorId: { not: user.id } },
    select: { id: true },
  });

  if (counterpart) {
    await publishDealReviews(deal.id);

    for (const participant of [deal.customerId, deal.designerId]) {
      await recomputeRating(participant);
      await grantAchievements(participant);
    }
    await recomputeLevel(deal.designerId);

    await postSystemMessage(deal.id, 'reviews.published', {});
  }

  await notify({
    userId: targetId,
    type: counterpart ? 'review_published' : 'review_received',
    payload: { dealTitle: deal.title, days: review_blind_days },
    link: counterpart ? `/deals/${deal.id}` : `/deals/${deal.id}`,
    withEmail: true,
  });

  await writeAuditLog({
    action: 'review.created',
    actorId: user.id,
    targetType: 'review',
    targetId: deal.id,
    payload: { targetRole, overall: parsed.data.overall },
  });

  revalidatePath(`/deals/${deal.id}`);

  return successState({
    message: counterpart ? 'reviews.publishedNow' : 'reviews.waitingOther',
    values: { days: review_blind_days },
  });
}

/**
 * Правка своего отзыва в течение окна (§4.8, по умолчанию 72 часа).
 *
 * После публикации правка тоже разрешена, пока окно не вышло: человек мог
 * остыть и захотеть смягчить формулировку — это честнее, чем требовать
 * жить с написанным в сердцах.
 */
export async function editReview(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const reviewId = String(formData.get('reviewId') ?? '');

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, authorId: true, dealId: true, targetId: true, editableUntil: true, status: true },
  });

  if (!review || review.authorId !== user.id) return errorState('errors.forbidden');
  if (review.status === 'hidden_by_moderator') return errorState('errors.review.hidden');
  if (review.editableUntil < new Date()) return errorState('errors.review.editWindowClosed');

  const parsed = reviewSchema.safeParse({
    dealId: review.dealId,
    overall: numberField(formData.get('overall')) ?? 0,
    sub1: numberField(formData.get('sub1')) ?? 0,
    sub2: numberField(formData.get('sub2')) ?? 0,
    sub3: numberField(formData.get('sub3')) ?? 0,
    text: formData.get('text') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  await prisma.review.update({
    where: { id: review.id },
    data: {
      overall: parsed.data.overall,
      sub1: parsed.data.sub1,
      sub2: parsed.data.sub2,
      sub3: parsed.data.sub3,
      text: parsed.data.text,
    },
  });

  // Опубликованный отзыв правкой меняет рейтинг адресата.
  if (review.status === 'published') await recomputeRating(review.targetId);

  revalidatePath(`/deals/${review.dealId}`);
  return successState({ message: 'settings.saved' });
}

/** Ответ на отзыв о себе. Один и навсегда: переписка тут никому не поможет. */
export async function replyToReview(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const parsed = reviewReplySchema.safeParse({
    reviewId: formData.get('reviewId') ?? '',
    reply: formData.get('reply') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const review = await prisma.review.findUnique({
    where: { id: parsed.data.reviewId },
    select: { id: true, targetId: true, status: true, reply: true, dealId: true, authorId: true },
  });

  if (!review || review.targetId !== user.id) return errorState('errors.forbidden');
  if (review.status !== 'published') return errorState('errors.review.notPublished');
  if (review.reply) return errorState('errors.review.alreadyReplied');

  await prisma.review.update({
    where: { id: review.id },
    data: { reply: parsed.data.reply, repliedAt: new Date() },
  });

  await notify({
    userId: review.authorId,
    type: 'review_replied',
    payload: { author: user.nickname },
    link: `/deals/${review.dealId}`,
  });

  revalidatePath(`/deals/${review.dealId}`);
  return successState({ message: 'settings.saved' });
}

/** Скрытие отзыва модератором (§4.8): текст остаётся, рейтинг пересчитывается. */
export async function hideReview(
  reviewId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return { ok: false, error: 'errors.forbidden' };

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, targetId: true, dealId: true },
  });

  if (!review) return { ok: false, error: 'errors.notFound' };

  await prisma.review.update({
    where: { id: review.id },
    data: {
      status: 'hidden_by_moderator',
      hiddenById: user.id,
      hiddenReason: reason.slice(0, 500) || null,
    },
  });

  await recomputeRating(review.targetId);

  await writeAuditLog({
    action: 'review.hidden',
    actorId: user.id,
    targetType: 'review',
    targetId: review.id,
    payload: { reason: reason.slice(0, 200) },
  });

  revalidatePath('/admin/reviews');
  revalidatePath(`/deals/${review.dealId}`);
  return { ok: true };
}

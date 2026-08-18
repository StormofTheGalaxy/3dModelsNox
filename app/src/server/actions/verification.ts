'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { verificationDecisionSchema, verificationSubmitSchema } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser, isStaff } from '../auth/session';
import { storeProfileImage } from '../media';
import { notify } from '../notifications';
import { checkRateLimit } from '../ratelimit';
import { recomputeLevel } from '../reputation';
import { getSetting } from '../settings';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Верификация дизайнеров (§4.9).
 *
 * Смысл проверки — подтвердить, что портфолио сделано этим человеком.
 * Поэтому вместе с картинками обязательно описание процесса: подделать
 * рендер проще, чем внятно рассказать, как он получен.
 */

/** Заявка: дизайнер выбирает задание из пула своей специализации. */
export async function startVerification(
  taskId: string,
): Promise<{ requestId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { error: 'errors.forbidden' };

  const profile = await prisma.designerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, verifiedAt: true },
  });

  if (!profile) return { error: 'errors.work.designerProfileRequired' };
  if (profile.verifiedAt) return { error: 'errors.verification.alreadyVerified' };

  const task = await prisma.testTask.findUnique({
    where: { id: taskId },
    select: { id: true, isActive: true },
  });
  if (!task?.isActive) return { error: 'errors.notFound' };

  // Незакрытая заявка одна: вторую параллельную подавать незачем.
  const open = await prisma.verificationRequest.findFirst({
    where: { userId: user.id, status: { in: ['draft', 'submitted'] } },
    select: { id: true, status: true },
  });

  if (open) {
    if (open.status === 'submitted') return { error: 'errors.verification.pending' };
    return { requestId: open.id };
  }

  const blocked = await prisma.verificationRequest.findFirst({
    where: { userId: user.id, status: 'rejected', retryAfter: { gt: new Date() } },
    select: { retryAfter: true },
  });
  if (blocked) return { error: 'errors.verification.retryLater' };

  const request = await prisma.verificationRequest.create({
    data: { userId: user.id, taskId: task.id },
    select: { id: true },
  });

  return { requestId: request.id };
}

/** Сдача: картинки плюс описание процесса. */
export async function submitVerification(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const parsed = verificationSubmitSchema.safeParse({
    requestId: formData.get('requestId') ?? '',
    processNote: formData.get('processNote') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const request = await prisma.verificationRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true, userId: true, status: true, images: { select: { id: true } } },
  });

  if (!request || request.userId !== user.id) return errorState('errors.forbidden');
  if (request.status !== 'draft') return errorState('errors.verification.pending');

  const files = formData
    .getAll('images')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0 && request.images.length === 0) {
    return errorState('errors.verification.imagesRequired');
  }

  // Приём картинок ограничивается частотой, как и остальные загрузки (§9 DoD).
  const limit = await checkRateLimit('upload', user.id);
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  let order = request.images.length;
  for (const file of files.slice(0, 10)) {
    const stored = await storeProfileImage(file, user.id, 'cover');
    if (!stored.ok) return errorState(stored.error, { values: stored.values });

    await prisma.verificationImage.create({
      data: { requestId: request.id, storageKey: stored.url, url: stored.url, order },
    });
    order += 1;
  }

  await prisma.verificationRequest.update({
    where: { id: request.id },
    data: {
      processNote: parsed.data.processNote,
      status: 'submitted',
      submittedAt: new Date(),
    },
  });

  revalidatePath('/verification');
  revalidatePath('/admin/verification');

  return successState({ message: 'verification.submitted' });
}

/** Решение модератора: одобрение даёт уровень verified и бейдж (§4.9). */
export async function decideVerification(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return errorState('errors.forbidden');

  const parsed = verificationDecisionSchema.safeParse({
    requestId: formData.get('requestId') ?? '',
    approve: formData.get('approve') === 'true',
    note: formData.get('note') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const request = await prisma.verificationRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true, userId: true, status: true },
  });

  if (!request) return errorState('errors.notFound');
  if (request.status !== 'submitted') return errorState('errors.verification.notSubmitted');

  const retryDays = await getSetting('verification_retry_days');

  await prisma.$transaction(async (tx) => {
    await tx.verificationRequest.update({
      where: { id: request.id },
      data: {
        status: parsed.data.approve ? 'approved' : 'rejected',
        decidedAt: new Date(),
        decidedById: user.id,
        decisionNote: parsed.data.note || null,
        retryAfter: parsed.data.approve
          ? null
          : new Date(Date.now() + retryDays * 86_400_000),
      },
    });

    if (parsed.data.approve) {
      await tx.designerProfile.updateMany({
        where: { userId: request.userId },
        // Уровень поднимается только с novice: pro и top выше verified.
        data: { verifiedAt: new Date() },
      });
    }
  });

  // Уровень пересчитывается по общим правилам, а не выставляется вручную.
  if (parsed.data.approve) await recomputeLevel(request.userId);

  await notify({
    userId: request.userId,
    type: 'verification_decided',
    payload: { approved: parsed.data.approve ? 1 : 0, days: retryDays },
    link: '/verification',
    push: true,
  });

  await writeAuditLog({
    action: parsed.data.approve ? 'verification.approved' : 'verification.rejected',
    actorId: user.id,
    targetType: 'user',
    targetId: request.userId,
    payload: { requestId: request.id },
  });

  revalidatePath('/admin/verification');
  return successState({ message: 'settings.saved' });
}

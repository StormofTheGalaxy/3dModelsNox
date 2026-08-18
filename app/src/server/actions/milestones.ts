'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { paymentSchema, revisionRequestSchema } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { finalMilestone, getMilestoneWithDeal, postSystemMessage } from '../deals';
import { storeDealFile, type StoredDealFile } from '../media';
import { notify } from '../notifications';
import { checkRateLimit } from '../ratelimit';
import { grantAchievements, recomputeLevel } from '../reputation';
import { enqueueWatermark } from '../queue';
import { getSetting, getSettings } from '../settings';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom, numberField } from './form';

/**
 * Жизненный цикл этапа (§4.6):
 * в работе → сдан → принят / на доработку → оплачен (чек) → оплата подтверждена.
 *
 * Платформа не проводит деньги: она фиксирует, что заказчик заявил об оплате,
 * а дизайнер это подтвердил. Никакие статусы не меняются автоматически по
 * факту «прошедшего платежа» — такого факта у платформы нет (§1.2).
 */

type MilestoneWithDeal = NonNullable<Awaited<ReturnType<typeof getMilestoneWithDeal>>>;

/** Общая проверка: этап существует, сделка идёт, пользователь — нужная сторона. */
async function loadMilestone(
  milestoneId: string,
  userId: string,
  side: 'customer' | 'designer',
): Promise<{ milestone: MilestoneWithDeal } | { error: string }> {
  const milestone = await getMilestoneWithDeal(milestoneId);
  if (!milestone) return { error: 'errors.notFound' };

  const expected = side === 'customer' ? milestone.deal.customerId : milestone.deal.designerId;
  if (expected !== userId) return { error: 'errors.forbidden' };

  if (milestone.deal.status === 'in_dispute') return { error: 'errors.deal.inDispute' };
  if (milestone.deal.status !== 'active') return { error: 'errors.deal.notActive' };

  return { milestone };
}

/**
 * Сдача этапа: новая версия со всеми файлами разом.
 *
 * Версии не перезаписываются — в споре важно видеть, что именно сдавалось
 * на каждом круге правок (§4.6).
 */
export async function submitDelivery(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const milestoneId = String(formData.get('milestoneId') ?? '');
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000);

  const loaded = await loadMilestone(milestoneId, user.id, 'designer');
  if ('error' in loaded) return errorState(loaded.error);

  const { milestone } = loaded;
  if (milestone.status !== 'in_work' && milestone.status !== 'revision') {
    return errorState('errors.deal.milestoneNotInWork');
  }

  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return errorState('errors.deal.deliveryFilesRequired');

  // Загрузка файлов ограничивается частотой наравне с портфолио (§9 DoD):
  // сдача этапа — такой же приём файлов от пользователя.
  const limit = await checkRateLimit('upload', user.id);
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  const limitGb = await getSetting('deal_files_limit_gb');
  const used = await prisma.deliveryFile.aggregate({
    where: { delivery: { milestone: { dealId: milestone.dealId } } },
    _sum: { sizeBytes: true },
  });

  const incoming = files.reduce((sum, file) => sum + file.size, 0);
  if ((used._sum.sizeBytes ?? 0) + incoming > limitGb * 1024 ** 3) {
    return errorState('errors.deal.filesLimitReached', { values: { limit: limitGb } });
  }

  // Водяной знак нужен только превью финального этапа: промежуточные
  // заказчик всё равно принимает и оплачивает до конца работы.
  const isFinal = finalMilestone(milestone.deal.milestones)?.id === milestone.id;

  const stored: StoredDealFile[] = [];
  for (const file of files) {
    const result = await storeDealFile(file, 'deliveries', user.id, { withPreview: true });
    if (!result.ok) return errorState(result.error, { values: result.values });
    stored.push(result.file);
  }

  const nextVersion =
    ((
      await prisma.delivery.aggregate({
        where: { milestoneId: milestone.id },
        _max: { version: true },
      })
    )._max.version ?? 0) + 1;

  const delivery = await prisma.$transaction(async (tx) => {
    const created = await tx.delivery.create({
      data: {
        milestoneId: milestone.id,
        version: nextVersion,
        note: note || null,
        files: {
          create: stored.map((entry) => ({
            storageKey: entry.storageKey,
            fileName: entry.fileName,
            mimeType: entry.mimeType,
            sizeBytes: entry.sizeBytes,
            previewUrl: entry.previewUrl,
            // Знак ставится только там, где есть что помечать.
            watermarkPending: isFinal && Boolean(entry.previewUrl),
          })),
        },
      },
      select: { id: true },
    });

    const late = milestone.dueDate ? new Date() > milestone.dueDate : false;

    await tx.milestone.update({
      where: { id: milestone.id },
      data: { status: 'submitted', submittedAt: new Date(), ...(late ? { wasLate: true } : {}) },
    });

    return created;
  });

  const pending = await prisma.deliveryFile.findMany({
    where: { deliveryId: delivery.id, watermarkPending: true },
    select: { id: true },
  });

  for (const file of pending) {
    await enqueueWatermark({ deliveryFileId: file.id });
  }

  await postSystemMessage(milestone.dealId, 'milestone.submitted', {
    title: milestone.title,
    version: nextVersion,
  });

  await notify({
    userId: milestone.deal.customerId,
    type: 'deal_milestone_submitted',
    payload: { dealTitle: milestone.deal.title, milestoneTitle: milestone.title },
    link: `/deals/${milestone.dealId}`,
    withEmail: true,
  });

  await writeAuditLog({
    action: 'milestone.submitted',
    actorId: user.id,
    targetType: 'milestone',
    targetId: milestone.id,
    payload: { version: nextVersion, files: stored.length },
  });

  revalidatePath(`/deals/${milestone.dealId}`);
  return successState({ message: 'deals.delivery.submitted' });
}

/**
 * Приёмка этапа заказчиком. Следующий этап сразу уходит в работу,
 * а дизайнер ждёт оплаты по принятому.
 */
export async function acceptMilestone(
  milestoneId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const loaded = await loadMilestone(milestoneId, user.id, 'customer');
  if ('error' in loaded) return { ok: false, error: loaded.error };

  const { milestone } = loaded;
  if (milestone.status !== 'submitted') return { ok: false, error: 'errors.deal.milestoneNotSubmitted' };

  const next = milestone.deal.milestones
    .filter((entry) => entry.position > milestone.position && entry.status === 'pending')
    .sort((a, b) => a.position - b.position)[0];

  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({
      where: { id: milestone.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });

    if (next) {
      await tx.milestone.update({ where: { id: next.id }, data: { status: 'in_work' } });
    }
  });

  await postSystemMessage(milestone.dealId, 'milestone.accepted', { title: milestone.title });
  if (next) {
    const nextTitle = await prisma.milestone.findUnique({
      where: { id: next.id },
      select: { title: true },
    });
    await postSystemMessage(milestone.dealId, 'milestone.started', {
      title: nextTitle?.title ?? '',
    });
  }

  await notify({
    userId: milestone.deal.designerId,
    type: 'deal_milestone_accepted',
    payload: { dealTitle: milestone.deal.title, milestoneTitle: milestone.title },
    link: `/deals/${milestone.dealId}`,
    withEmail: true,
  });

  await writeAuditLog({
    action: 'milestone.accepted',
    actorId: user.id,
    targetType: 'milestone',
    targetId: milestone.id,
  });

  revalidatePath(`/deals/${milestone.dealId}`);
  return { ok: true };
}

/**
 * Отправка на доработку. Раунд списывается сразу: иначе «бесплатные»
 * правки растягиваются бесконечно и спор становится неразрешимым.
 *
 * Когда раунды исчерпаны, действие не блокируется — заказчику показывается,
 * что правка сверх лимита, и стороны договариваются допсоглашением (§4.6).
 */
export async function requestRevision(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const parsed = revisionRequestSchema.safeParse({
    milestoneId: formData.get('milestoneId') ?? '',
    comment: formData.get('comment') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const loaded = await loadMilestone(parsed.data.milestoneId, user.id, 'customer');
  if ('error' in loaded) return errorState(loaded.error);

  const { milestone } = loaded;
  if (milestone.status !== 'submitted') return errorState('errors.deal.milestoneNotSubmitted');

  const included = milestone.deal.revisionRoundsIncluded;
  const used = milestone.revisionRoundsUsed;
  const overLimit = used >= included;

  await prisma.milestone.update({
    where: { id: milestone.id },
    data: { status: 'revision', revisionRoundsUsed: { increment: 1 } },
  });

  await prisma.dealMessage.create({
    data: {
      dealId: milestone.dealId,
      kind: 'user',
      authorId: user.id,
      text: parsed.data.comment,
    },
  });

  await postSystemMessage(milestone.dealId, 'milestone.revision', {
    title: milestone.title,
    round: used + 1,
    included,
  });

  await notify({
    userId: milestone.deal.designerId,
    type: 'deal_revision_requested',
    payload: {
      dealTitle: milestone.deal.title,
      milestoneTitle: milestone.title,
      round: used + 1,
      included,
    },
    link: `/deals/${milestone.dealId}`,
    withEmail: true,
  });

  await writeAuditLog({
    action: 'milestone.revision',
    actorId: user.id,
    targetType: 'milestone',
    targetId: milestone.id,
    payload: { round: used + 1, overLimit },
  });

  revalidatePath(`/deals/${milestone.dealId}`);

  return successState({
    message: overLimit ? 'deals.revision.overLimit' : 'deals.revision.sent',
    values: { round: used + 1, included },
  });
}

/**
 * Заказчик заявляет об оплате и прикладывает чек.
 *
 * Это именно заявление, а не факт оплаты: платформа не имеет доступа к
 * платёжным системам и фиксирует только присланное подтверждение (§1.2).
 */
export async function claimPayment(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  const parsed = paymentSchema.safeParse({
    milestoneId: formData.get('milestoneId') ?? '',
    amount: numberField(formData.get('amount')) ?? 0,
    currency: formData.get('currency') || undefined,
    method: formData.get('method') || undefined,
    txHash: formData.get('txHash') ?? '',
    note: formData.get('note') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const loaded = await loadMilestone(parsed.data.milestoneId, user.id, 'customer');
  if ('error' in loaded) return errorState(loaded.error);

  const { milestone } = loaded;
  if (milestone.status !== 'accepted' && milestone.status !== 'paid_claimed') {
    return errorState('errors.deal.milestoneNotAccepted');
  }

  const receipts = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (receipts.length === 0) return errorState('errors.deal.receiptRequired');

  const uploadLimit = await checkRateLimit('upload', user.id);
  if (!uploadLimit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: uploadLimit.retryAfterSeconds } });
  }

  const stored: StoredDealFile[] = [];
  for (const file of receipts) {
    const result = await storeDealFile(file, 'receipts', user.id);
    if (!result.ok) return errorState(result.error, { values: result.values });
    stored.push(result.file);
  }

  // Выборочная проверка чеков: в бете проверяются все (§4.6).
  const { receipt_check_all, receipt_random_check_pct } = await getSettings([
    'receipt_check_all',
    'receipt_random_check_pct',
  ]);
  const sampled = receipt_check_all || Math.random() * 100 < receipt_random_check_pct;

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.paymentConfirmation.create({
      data: {
        milestoneId: milestone.id,
        uploadedById: user.id,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        method: parsed.data.method,
        txHash: parsed.data.txHash || null,
        note: parsed.data.note || null,
        customerClaimedAt: new Date(),
        status: 'pending',
        adminCheck: sampled ? 'random_ok' : 'none',
        files: {
          create: stored.map((file) => ({
            storageKey: file.storageKey,
            fileName: file.fileName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          })),
        },
      },
      select: { id: true },
    });

    await tx.milestone.update({ where: { id: milestone.id }, data: { status: 'paid_claimed' } });

    return created;
  });

  await postSystemMessage(milestone.dealId, 'payment.claimed', {
    title: milestone.title,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
  });

  await notify({
    userId: milestone.deal.designerId,
    type: 'deal_payment_claimed',
    payload: {
      dealTitle: milestone.deal.title,
      milestoneTitle: milestone.title,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
    },
    link: `/deals/${milestone.dealId}`,
    withEmail: true,
  });

  await writeAuditLog({
    action: 'payment.claimed',
    actorId: user.id,
    targetType: 'payment',
    targetId: payment.id,
    payload: { milestoneId: milestone.id, amount: parsed.data.amount, sampled },
  });

  revalidatePath(`/deals/${milestone.dealId}`);
  return successState({ message: 'deals.payment.claimed' });
}

/**
 * «Деньги получил» от дизайнера — единственное, что закрывает этап.
 *
 * После подтверждения финального этапа сделка закрывается и открываются
 * исходники: до этого момента заказчик видел только превью (§4.6).
 */
export async function confirmPayment(
  paymentId: string,
): Promise<{ ok: boolean; error?: string; dealCompleted?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const payment = await prisma.paymentConfirmation.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, amount: true, currency: true, milestoneId: true },
  });

  if (!payment) return { ok: false, error: 'errors.notFound' };
  if (payment.status === 'confirmed') return { ok: false, error: 'errors.deal.paymentAlreadyConfirmed' };

  const loaded = await loadMilestone(payment.milestoneId, user.id, 'designer');
  if ('error' in loaded) return { ok: false, error: loaded.error };

  const { milestone } = loaded;
  if (milestone.status !== 'paid_claimed') return { ok: false, error: 'errors.deal.paymentNotClaimed' };

  const previousLevel = (
    await prisma.designerProfile.findUnique({
      where: { userId: milestone.deal.designerId },
      select: { level: true },
    })
  )?.level;

  const isFinal = finalMilestone(milestone.deal.milestones)?.id === milestone.id;
  const othersDone = milestone.deal.milestones
    .filter((entry) => entry.id !== milestone.id)
    .every((entry) => entry.status === 'paid_confirmed');
  const dealCompleted = isFinal && othersDone;

  await prisma.$transaction(async (tx) => {
    await tx.paymentConfirmation.update({
      where: { id: payment.id },
      data: { status: 'confirmed', designerConfirmedAt: new Date() },
    });

    await tx.milestone.update({ where: { id: milestone.id }, data: { status: 'paid_confirmed' } });

    if (dealCompleted) {
      await tx.deal.update({
        where: { id: milestone.dealId },
        data: { status: 'completed', completedAt: new Date() },
      });

      if (milestone.deal.orderId) {
        await tx.order.update({
          where: { id: milestone.deal.orderId },
          data: { status: 'completed' },
        });
      }
    }
  });

  await postSystemMessage(milestone.dealId, 'payment.confirmed', {
    title: milestone.title,
    amount: payment.amount,
    currency: payment.currency,
  });

  await notify({
    userId: milestone.deal.customerId,
    type: 'deal_payment_confirmed',
    payload: {
      dealTitle: milestone.deal.title,
      milestoneTitle: milestone.title,
      amount: payment.amount,
      currency: payment.currency,
    },
    link: `/deals/${milestone.dealId}`,
    withEmail: true,
  });

  await writeAuditLog({
    action: 'payment.confirmed',
    actorId: user.id,
    targetType: 'payment',
    targetId: payment.id,
    payload: { milestoneId: milestone.id },
  });

  if (dealCompleted) {
    await postSystemMessage(milestone.dealId, 'deal.completed', { title: milestone.deal.title });

    for (const userId of [milestone.deal.customerId, milestone.deal.designerId]) {
      await notify({
        userId,
        type: 'deal_completed',
        payload: { dealTitle: milestone.deal.title },
        link: `/deals/${milestone.dealId}`,
        withEmail: true,
      });
    }

    await writeAuditLog({
      action: 'deal.completed',
      actorId: user.id,
      targetType: 'deal',
      targetId: milestone.dealId,
    });

    // Репутация обновляется по событию завершения сделки, а не только
    // еженедельным прогоном (§4.8): дизайнер должен увидеть результат сразу.
    await prisma.designerProfile.updateMany({
      where: { userId: milestone.deal.designerId },
      data: { ordersCompleted: { increment: 1 } },
    });

    for (const participant of [milestone.deal.customerId, milestone.deal.designerId]) {
      await grantAchievements(participant);
    }

    const level = await recomputeLevel(milestone.deal.designerId);
    if (level && level !== previousLevel) {
      await notify({
        userId: milestone.deal.designerId,
        type: 'level_changed',
        payload: { level },
        link: '/profile/designer',
        withEmail: true,
      });
    }
  }

  revalidatePath(`/deals/${milestone.dealId}`);
  return { ok: true, dealCompleted };
}

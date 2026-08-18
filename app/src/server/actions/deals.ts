'use server';

import { revalidatePath } from 'next/cache';

import { prisma, type Prisma } from '@polyforge/db';
import { milestonePlanSchema } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser, isStaff } from '../auth/session';
import { getDealForUser, postSystemMessage } from '../deals';
import { notify } from '../notifications';
import { getSetting } from '../settings';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Сделка (§4.6): создание из принятого отклика, план этапов, пауза, отмена.
 */

/**
 * Создаёт сделку из принятого отклика.
 *
 * ТЗ замораживается снимком версии: правки после старта идут только через
 * BriefChangeRequest с подтверждением второй стороны (§4.4).
 */
export async function createDealFromResponse(
  responseId: string,
): Promise<{ dealId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { error: 'errors.forbidden' };

  const response = await prisma.orderResponse.findUnique({
    where: { id: responseId },
    select: {
      id: true,
      designerId: true,
      price: true,
      currency: true,
      status: true,
      order: {
        select: {
          id: true,
          customerId: true,
          title: true,
          briefId: true,
          deal: { select: { id: true } },
          brief: { select: { currentVersion: true, sections: true } },
        },
      },
    },
  });

  if (!response || response.order.customerId !== user.id) return { error: 'errors.forbidden' };
  if (response.status !== 'accepted') return { error: 'errors.deal.responseNotAccepted' };
  // Повторный вызов не должен плодить сделки на один заказ.
  if (response.order.deal) return { dealId: response.order.deal.id };

  // Снимок ТЗ: если версии ещё нет, создаём её из текущего состояния.
  let briefVersion = await prisma.briefVersion.findFirst({
    where: { briefId: response.order.briefId, version: response.order.brief.currentVersion },
    select: { id: true },
  });

  if (!briefVersion) {
    briefVersion = await prisma.briefVersion.create({
      data: {
        briefId: response.order.briefId,
        version: response.order.brief.currentVersion,
        title: response.order.title,
        sections: response.order.brief.sections as Prisma.InputJsonValue,
        authorId: user.id,
        comment: 'snapshot',
      },
      select: { id: true },
    });
  }

  const revisionRounds = await getSetting('milestones_max');

  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        orderId: response.order.id,
        briefVersionId: briefVersion.id,
        customerId: user.id,
        designerId: response.designerId,
        title: response.order.title,
        price: response.price,
        currency: response.currency,
        // Раунды правок берутся из ТЗ: это его обязательное поле (§3).
        revisionRoundsIncluded: readRevisionRounds(response.order.brief.sections),
      },
      select: { id: true },
    });

    // ТЗ замораживается вместе со стартом сделки.
    await tx.brief.update({
      where: { id: response.order.briefId },
      data: { status: 'frozen' },
    });

    return created;
  });

  await postSystemMessage(deal.id, 'deal.created', { title: response.order.title });

  await notify({
    userId: response.designerId,
    type: 'response_accepted',
    payload: { orderTitle: response.order.title },
    link: `/deals/${deal.id}`,
    push: true,
  });

  await writeAuditLog({
    action: 'deal.created',
    actorId: user.id,
    targetType: 'deal',
    targetId: deal.id,
    payload: { responseId, orderId: response.order.id },
  });

  // Ограничение по количеству этапов пригодится на экране плана.
  void revisionRounds;

  return { dealId: deal.id };
}

/**
 * Создаёт сделку из выигравшей ставки аукциона (§3, post-MVP №1).
 *
 * Отличие от пути через отклик — кто вызывает: там сделку начинает заказчик,
 * приняв отклик, а здесь дизайнер, приняв победу. Условия сделки берутся из
 * ставки: цена и срок — это ровно то, за что торговались.
 */
export async function createDealFromBid(
  bidId: string,
): Promise<{ dealId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { error: 'errors.forbidden' };

  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    select: {
      id: true,
      designerId: true,
      amount: true,
      currency: true,
      order: {
        select: {
          id: true,
          customerId: true,
          title: true,
          briefId: true,
          deal: { select: { id: true } },
          brief: { select: { currentVersion: true, sections: true } },
          auction: { select: { winnerBidId: true, winnerDecision: true } },
        },
      },
    },
  });

  if (!bid || bid.designerId !== user.id) return { error: 'errors.forbidden' };

  const auction = bid.order.auction;
  if (!auction || auction.winnerBidId !== bid.id || auction.winnerDecision !== 'accepted') {
    return { error: 'errors.auction.notWinner' };
  }

  if (bid.order.deal) return { dealId: bid.order.deal.id };

  // Снимок ТЗ делается от имени владельца ТЗ — заказчика, а не победителя.
  let briefVersion = await prisma.briefVersion.findFirst({
    where: { briefId: bid.order.briefId, version: bid.order.brief.currentVersion },
    select: { id: true },
  });

  if (!briefVersion) {
    briefVersion = await prisma.briefVersion.create({
      data: {
        briefId: bid.order.briefId,
        version: bid.order.brief.currentVersion,
        title: bid.order.title,
        sections: bid.order.brief.sections as Prisma.InputJsonValue,
        authorId: bid.order.customerId,
        comment: 'snapshot',
      },
      select: { id: true },
    });
  }

  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        orderId: bid.order.id,
        briefVersionId: briefVersion.id,
        customerId: bid.order.customerId,
        designerId: bid.designerId,
        title: bid.order.title,
        price: bid.amount,
        currency: bid.currency,
        revisionRoundsIncluded: readRevisionRounds(bid.order.brief.sections),
      },
      select: { id: true },
    });

    await tx.brief.update({ where: { id: bid.order.briefId }, data: { status: 'frozen' } });

    return created;
  });

  await postSystemMessage(deal.id, 'deal.created', { title: bid.order.title });

  await notify({
    userId: bid.order.customerId,
    type: 'deal_started',
    payload: { orderTitle: bid.order.title },
    link: `/deals/${deal.id}`,
    push: true,
  });

  await writeAuditLog({
    action: 'deal.created',
    actorId: user.id,
    targetType: 'deal',
    targetId: deal.id,
    payload: { bidId, orderId: bid.order.id, source: 'auction' },
  });

  return { dealId: deal.id };
}

/** Раунды правок из секции delivery замороженного ТЗ. */
function readRevisionRounds(sections: unknown): number {
  const delivery = (sections as { delivery?: { revisionRounds?: unknown } } | null)?.delivery;
  const value = delivery?.revisionRounds;
  return typeof value === 'number' && Number.isFinite(value) ? value : 2;
}

/**
 * Сохранение плана этапов. Предложить план может любая сторона, но
 * подтверждение обеих обязательно — до этого сделка не активна (§4.6).
 */
export async function saveMilestonePlan(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');

  let milestones: unknown = [];
  try {
    milestones = JSON.parse(String(formData.get('milestones') ?? '[]'));
  } catch {
    return errorState('errors.generic');
  }

  const parsed = milestonePlanSchema.safeParse({
    dealId: formData.get('dealId') ?? '',
    milestones,
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const access = await getDealForUser(parsed.data.dealId, user.id);
  if (!access || access.role === 'staff') return errorState('errors.forbidden');

  const { deal } = access;
  if (deal.status !== 'plan_agreement') return errorState('errors.deal.planLocked');

  const total = parsed.data.milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  // Сумма этапов обязана сойтись с ценой сделки — иначе стороны спорят,
  // за что именно платят.
  if (total !== deal.price) {
    return errorState('errors.deal.planSumMismatch', {
      values: { total, price: deal.price, currency: deal.currency },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.milestone.deleteMany({ where: { dealId: deal.id } });

    await tx.milestone.createMany({
      data: parsed.data.milestones.map((milestone, index) => ({
        dealId: deal.id,
        position: index + 1,
        title: milestone.title,
        description: milestone.description || null,
        amount: milestone.amount,
        currency: deal.currency,
        dueDate: milestone.dueDate ? new Date(milestone.dueDate) : null,
      })),
    });

    // Изменённый план сбрасывает оба подтверждения: вторая сторона
    // соглашалась на другой набор этапов.
    await tx.deal.update({
      where: { id: deal.id },
      data: { planConfirmedByCustomerAt: null, planConfirmedByDesignerAt: null },
    });
  });

  await postSystemMessage(deal.id, 'plan.proposed', {
    author: user.nickname,
    count: parsed.data.milestones.length,
  });

  const other = access.role === 'customer' ? deal.designerId : deal.customerId;
  await notify({
    userId: other,
    type: 'system',
    payload: { dealTitle: deal.title },
    link: `/deals/${deal.id}`,
  });

  revalidatePath(`/deals/${deal.id}`);

  return successState({ message: 'settings.saved' });
}

/** Подтверждение плана. Когда подтвердили обе стороны — сделка активна. */
export async function confirmMilestonePlan(dealId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const access = await getDealForUser(dealId, user.id);
  if (!access || access.role === 'staff') return { ok: false, error: 'errors.forbidden' };

  const { deal, role } = access;
  if (deal.status !== 'plan_agreement') return { ok: false, error: 'errors.deal.planLocked' };
  if (deal.milestones.length === 0) return { ok: false, error: 'errors.deal.planEmpty' };

  const now = new Date();
  const customerAt = role === 'customer' ? now : deal.planConfirmedByCustomerAt;
  const designerAt = role === 'designer' ? now : deal.planConfirmedByDesignerAt;
  const bothConfirmed = Boolean(customerAt && designerAt);

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: deal.id },
      data: {
        planConfirmedByCustomerAt: customerAt,
        planConfirmedByDesignerAt: designerAt,
        ...(bothConfirmed ? { status: 'active' as const } : {}),
      },
    });

    // Первый этап сразу уходит в работу: ждать отдельной кнопки незачем.
    if (bothConfirmed) {
      const first = deal.milestones[0];
      if (first) {
        await tx.milestone.update({ where: { id: first.id }, data: { status: 'in_work' } });
      }
    }
  });

  await postSystemMessage(deal.id, 'plan.confirmed', { author: user.nickname });

  if (bothConfirmed) {
    const first = deal.milestones[0];
    if (first) {
      await postSystemMessage(deal.id, 'milestone.started', { title: first.title });
    }

    await writeAuditLog({
      action: 'deal.plan_confirmed',
      actorId: user.id,
      targetType: 'deal',
      targetId: deal.id,
    });
  }

  const other = role === 'customer' ? deal.designerId : deal.customerId;
  await notify({
    userId: other,
    type: 'system',
    payload: { dealTitle: deal.title },
    link: `/deals/${deal.id}`,
    push: bothConfirmed,
  });

  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** Пауза по обоюдному согласию: дедлайны сдвигаются, метрики не страдают (§4.6). */
export async function toggleDealPause(
  dealId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const access = await getDealForUser(dealId, user.id);
  if (!access || access.role === 'staff') return { ok: false, error: 'errors.forbidden' };

  const { deal } = access;

  if (deal.status === 'paused') {
    const pausedFor = deal.pausedAt ? Date.now() - deal.pausedAt.getTime() : 0;

    await prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id: deal.id },
        data: { status: 'active', pausedAt: null, pauseReason: null },
      });

      // Дедлайны сдвигаются ровно на длительность паузы — иначе пауза
      // превращается в просрочку задним числом.
      if (pausedFor > 0) {
        const milestones = await tx.milestone.findMany({
          where: { dealId: deal.id, dueDate: { not: null } },
          select: { id: true, dueDate: true },
        });

        for (const milestone of milestones) {
          if (!milestone.dueDate) continue;
          await tx.milestone.update({
            where: { id: milestone.id },
            data: { dueDate: new Date(milestone.dueDate.getTime() + pausedFor) },
          });
        }
      }
    });

    await postSystemMessage(deal.id, 'deal.resumed', { author: user.nickname });
  } else {
    if (deal.status !== 'active') return { ok: false, error: 'errors.deal.notActive' };

    await prisma.deal.update({
      where: { id: deal.id },
      data: { status: 'paused', pausedAt: new Date(), pauseReason: reason.slice(0, 500) || null },
    });

    await postSystemMessage(deal.id, 'deal.paused', { author: user.nickname });
    await writeAuditLog({
      action: 'deal.paused',
      actorId: user.id,
      targetType: 'deal',
      targetId: deal.id,
    });
  }

  const other = access.role === 'customer' ? deal.designerId : deal.customerId;
  await notify({
    userId: other,
    type: 'system',
    payload: { dealTitle: deal.title },
    link: `/deals/${dealId}`,
  });

  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/**
 * Отмена по обоюдному согласию (§4.6): фиксируется, что сдано и оплачено,
 * без репутационных последствий. Спорная отмена идёт через спор.
 */
export async function cancelDeal(
  dealId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const access = await getDealForUser(dealId, user.id);
  if (!access || access.role === 'staff') return { ok: false, error: 'errors.forbidden' };

  const { deal } = access;
  if (deal.status === 'completed' || deal.status === 'cancelled') {
    return { ok: false, error: 'errors.deal.alreadyClosed' };
  }
  if (deal.status === 'in_dispute') return { ok: false, error: 'errors.deal.inDispute' };

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: deal.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason.slice(0, 1000) || null,
      },
    });

    if (deal.orderId) {
      await tx.order.update({ where: { id: deal.orderId }, data: { status: 'cancelled' } });
    }
  });

  await postSystemMessage(deal.id, 'deal.cancelled', { author: user.nickname });

  await writeAuditLog({
    action: 'deal.cancelled',
    actorId: user.id,
    targetType: 'deal',
    targetId: deal.id,
    payload: { reason: reason.slice(0, 200) },
  });

  const other = access.role === 'customer' ? deal.designerId : deal.customerId;
  await notify({
    userId: other,
    type: 'system',
    payload: { dealTitle: deal.title },
    link: `/deals/${dealId}`,
    push: true,
  });

  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** Согласие заказчика на публикацию работы в портфолио (§4.6). */
export async function setPortfolioPermission(
  dealId: string,
  allowed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const access = await getDealForUser(dealId, user.id);
  if (!access || access.role !== 'customer') return { ok: false, error: 'errors.forbidden' };

  await prisma.deal.update({ where: { id: dealId }, data: { portfolioAllowed: allowed } });

  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** Сделки, доступные админ-ролям для разбора. */
export async function canViewAsStaff(): Promise<boolean> {
  const user = await getCurrentUser();
  return isStaff(user);
}

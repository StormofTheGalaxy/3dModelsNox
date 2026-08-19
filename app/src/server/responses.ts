import 'server-only';

import { prisma } from '@polyforge/db';

import { getSetting } from './settings';
import { activePerks } from './monetization';

/**
 * Отклики (§4.5): лимиты, списки, метрики.
 */

/**
 * Сколько откликов дизайнер может отправить сегодня. Лимит зависит от уровня
 * и живёт в настройках (§6, `responses_per_day`), а тариф может его поднять
 * (post-MVP №12). При выключенных подписках надбавка нулевая.
 */
export async function responsesLeftToday(
  designerId: string,
): Promise<{ left: number; limit: number }> {
  const [limits, profile, perks] = await Promise.all([
    getSetting('responses_per_day'),
    prisma.designerProfile.findUnique({
      where: { userId: designerId },
      select: { level: true },
    }),
    activePerks(designerId),
  ]);

  const limit = limits[profile?.level ?? 'novice'] + (perks.responsesPerDay ?? 0);

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const sent = await prisma.orderResponse.count({
    where: { designerId, createdAt: { gte: since } },
  });

  return { left: Math.max(0, limit - sent), limit };
}

const RESPONSE_SELECT = {
  id: true,
  coverText: true,
  price: true,
  currency: true,
  days: true,
  attachedWorkIds: true,
  isInvited: true,
  status: true,
  rejectReason: true,
  viewedAt: true,
  createdAt: true,
} as const;

/**
 * Отклики на заказ — только для заказчика. Приглашённые идут первыми (§3).
 *
 * Теневой бан отсекается здесь же: заказчик не должен видеть откликов от
 * тех, кого платформа скрыла, а сам дизайнер продолжает видеть свой отклик
 * в «Моих откликах» и ни о чём не догадывается (§3).
 */
export async function listOrderResponses(orderId: string) {
  return prisma.orderResponse.findMany({
    where: { orderId, designer: { status: 'active' } },
    orderBy: [{ isInvited: 'desc' }, { createdAt: 'desc' }],
    select: {
      ...RESPONSE_SELECT,
      designer: {
        select: {
          id: true,
          nickname: true,
          designerProfile: {
            select: {
              avatarUrl: true,
              level: true,
              rating: true,
              ratingCount: true,
              ordersCompleted: true,
              specializations: true,
              country: true,
            },
          },
        },
      },
    },
  });
}

/** Свои отклики — экран дизайнера со статусами (§4.5). */
export async function listDesignerResponses(designerId: string) {
  return prisma.orderResponse.findMany({
    where: { designerId },
    orderBy: { createdAt: 'desc' },
    select: {
      ...RESPONSE_SELECT,
      order: {
        select: {
          id: true,
          title: true,
          status: true,
          budgetMode: true,
          budgetAmount: true,
          budgetCurrency: true,
          customer: { select: { nickname: true } },
        },
      },
    },
  });
}

export async function getResponse(responseId: string) {
  return prisma.orderResponse.findUnique({
    where: { id: responseId },
    select: {
      ...RESPONSE_SELECT,
      designerId: true,
      orderId: true,
      order: { select: { customerId: true, title: true, status: true } },
    },
  });
}

/** Прикреплённые к отклику работы — карточки для заказчика. */
export async function getAttachedWorks(workIds: string[]) {
  if (workIds.length === 0) return [];

  return prisma.portfolioWork.findMany({
    where: { id: { in: workIds }, isHidden: false },
    select: {
      id: true,
      title: true,
      likesCount: true,
      views: true,
      badgeOnPlatform: true,
      designer: { select: { nickname: true } },
      media: {
        where: { type: 'image' },
        orderBy: { order: 'asc' },
        take: 1,
        select: { url: true, thumbnailUrl: true, width: true, height: true },
      },
    },
  });
}

/** Отклик текущего дизайнера на заказ, если он уже есть. */
export async function getOwnResponse(orderId: string, designerId: string) {
  return prisma.orderResponse.findUnique({
    where: { orderId_designerId: { orderId, designerId } },
    select: RESPONSE_SELECT,
  });
}

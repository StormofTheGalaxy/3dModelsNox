import { prisma } from '@polyforge/db';

import { notifyUser } from '../notify';

/**
 * Сопровождение торгов (§3, post-MVP №1).
 *
 * Три перехода состояния живут по времени, а не по действию пользователя:
 * дедлайн торгов, напоминание «скоро закончатся» и срок ответа победителя.
 * Все три — крон, потому что ни у кого из сторон нет причин открыть страницу
 * ровно в нужную минуту.
 */

async function settingNumber(key: string, fallback: number): Promise<number> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  return typeof setting?.value === 'number' ? setting.value : fallback;
}

/** Разослать участникам торгов одно уведомление. */
async function notifyBidders(
  orderId: string,
  orderTitle: string,
  type: 'auction_closed' | 'auction_ending_soon',
  extra: Record<string, string | number | boolean> = {},
): Promise<void> {
  const bids = await prisma.bid.findMany({
    where: { orderId, withdrawnAt: null },
    select: { designerId: true },
    distinct: ['designerId'],
  });

  for (const bid of bids) {
    await notifyUser({
      userId: bid.designerId,
      type,
      payload: { orderTitle, ...extra },
      link: `/orders/${orderId}`,
    });
  }
}

/**
 * Закрытие торгов по дедлайну. Закрытые ставки в этот момент вскрываются:
 * до него их не видел никто, включая заказчика.
 */
export async function closeExpiredAuctions(): Promise<number> {
  const now = new Date();

  const due = await prisma.auction.findMany({
    where: { closedAt: null, endsAt: { not: null, lte: now } },
    select: {
      id: true,
      orderId: true,
      mode: true,
      order: { select: { title: true, customerId: true, status: true } },
    },
    take: 200,
  });

  if (due.length === 0) return 0;

  for (const auction of due) {
    await prisma.auction.update({
      where: { id: auction.id },
      data: { closedAt: now, revealedAt: now },
    });

    await notifyBidders(auction.orderId, auction.order.title, 'auction_closed');

    // Заказчику это письмо, а не колокольчик: без его выбора торги
    // так и останутся без победителя.
    await notifyUser({
      userId: auction.order.customerId,
      type: 'auction_closed',
      payload: { orderTitle: auction.order.title },
      link: `/orders/${auction.orderId}`,
      withEmail: true,
    });
  }

  return due.length;
}

/** Напоминание «торги скоро закончатся» — один раз на аукцион. */
export async function remindAuctionsEndingSoon(): Promise<number> {
  const hours = await settingNumber('auction_ending_soon_hours', 6);
  const now = new Date();
  const horizon = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const soon = await prisma.auction.findMany({
    where: {
      closedAt: null,
      endingSoonNotifiedAt: null,
      endsAt: { not: null, gt: now, lte: horizon },
    },
    select: { id: true, orderId: true, order: { select: { title: true } } },
    take: 200,
  });

  if (soon.length === 0) return 0;

  for (const auction of soon) {
    await notifyBidders(auction.orderId, auction.order.title, 'auction_ending_soon', { hours });

    await prisma.auction.update({
      where: { id: auction.id },
      data: { endingSoonNotifiedAt: now },
    });
  }

  return soon.length;
}

/**
 * Победитель не ответил в срок. Торги необязывающие, поэтому это не санкция,
 * но в метрику надёжности молчание попадает так же, как явный отказ (§3):
 * заказчик всё это время ждал.
 */
export async function expireWinnerDecisions(): Promise<number> {
  const now = new Date();

  const stale = await prisma.auction.findMany({
    where: {
      winnerDecision: 'pending',
      winnerBidId: { not: null },
      winnerDeadlineAt: { not: null, lte: now },
    },
    select: {
      id: true,
      orderId: true,
      winnerBidId: true,
      winnerBid: { select: { designerId: true } },
      order: { select: { title: true, customerId: true } },
    },
    take: 200,
  });

  if (stale.length === 0) return 0;

  for (const auction of stale) {
    if (!auction.winnerBid) continue;

    await prisma.$transaction([
      prisma.auction.update({
        where: { id: auction.id },
        data: { winnerDecision: 'expired', winnerRespondedAt: now, winnerBidId: null },
      }),
      ...(auction.winnerBidId
        ? [prisma.bid.update({ where: { id: auction.winnerBidId }, data: { withdrawnAt: now } })]
        : []),
      prisma.designerProfile.update({
        where: { userId: auction.winnerBid.designerId },
        data: { auctionsDeclined: { increment: 1 } },
      }),
    ]);

    await notifyUser({
      userId: auction.order.customerId,
      type: 'auction_winner_declined',
      payload: { orderTitle: auction.order.title, expired: true },
      link: `/orders/${auction.orderId}`,
      withEmail: true,
    });
  }

  return stale.length;
}

'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { bidSchema, bidUndercutsPrevious } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { auctionEnabled, notifyBidders, ownActiveBid, settleDeclinedWinner } from '../auctions';
import { createDealFromBid } from './deals';
import { notify } from '../notifications';
import { checkRateLimit } from '../ratelimit';
import { getSetting } from '../settings';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Торги по заказу (§3, post-MVP №1).
 *
 * Модуль целиком за флагом `feature_auction`: пока он выключен, каждое
 * действие отвечает отказом, даже если форму кто-то отправит напрямую.
 * Проверка живёт здесь, а не только в разметке.
 */

/** Ставка дизайнера. В открытом режиме — только вниз относительно своей прошлой. */
export async function placeBid(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  if (!(await auctionEnabled())) return errorState('errors.auction.disabled');

  const parsed = bidSchema.safeParse({
    orderId: formData.get('orderId') ?? '',
    amount: Number(formData.get('amount') ?? 0),
    currency: formData.get('currency') ?? 'USD',
    days: Number(formData.get('days') ?? 0),
    comment: formData.get('comment') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const input = parsed.data;

  const limit = await checkRateLimit('bid', user.id);
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  const profile = await prisma.designerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) return errorState('errors.response.designerProfileRequired');

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      title: true,
      status: true,
      customerId: true,
      workMode: true,
      auction: {
        select: {
          id: true,
          mode: true,
          startPrice: true,
          currency: true,
          endsAt: true,
          closedAt: true,
        },
      },
    },
  });

  if (!order?.auction || order.workMode !== 'auction') return errorState('errors.auction.notFound');
  if (order.status !== 'published') return errorState('errors.order.notPublished');
  if (order.customerId === user.id) return errorState('errors.response.ownOrder');

  const auction = order.auction;
  const now = new Date();

  if (auction.closedAt) return errorState('errors.auction.closed');
  if (auction.endsAt && auction.endsAt <= now) return errorState('errors.auction.closed');

  if (input.currency !== auction.currency) return errorState('errors.auction.currencyMismatch');

  // Стартовая цена — это потолок: обратный аукцион идёт вниз от неё.
  if (auction.startPrice !== null && input.amount > auction.startPrice) {
    return errorState('errors.auction.aboveStartPrice', {
      values: { amount: auction.startPrice, currency: auction.currency },
    });
  }

  const [maxBids, minDecrementPct] = await Promise.all([
    getSetting('auction_max_bids_per_designer'),
    getSetting('auction_min_decrement_pct'),
  ]);

  const placed = await prisma.bid.count({ where: { orderId: order.id, designerId: user.id } });
  if (placed >= maxBids) {
    return errorState('errors.auction.tooManyBids', { values: { limit: maxBids } });
  }

  const previous = await ownActiveBid(order.id, user.id);

  // Перебивать можно только самого себя и только вниз: иначе торги
  // превращаются в способ поднять цену после того, как её увидели соседи.
  if (previous && !bidUndercutsPrevious(input.amount, previous.amount, minDecrementPct)) {
    return errorState('errors.auction.mustUndercut', {
      values: { amount: previous.amount, currency: auction.currency, percent: minDecrementPct },
    });
  }

  // Кто вёл до этой ставки — понадобится, чтобы сказать ему, что его обошли.
  const leaderBefore =
    auction.mode === 'open_reverse'
      ? await prisma.bid.findFirst({
          where: { orderId: order.id, withdrawnAt: null, designerId: { not: user.id } },
          orderBy: { amount: 'asc' },
          select: { designerId: true, amount: true },
        })
      : null;

  await prisma.$transaction([
    prisma.bid.create({
      data: {
        orderId: order.id,
        designerId: user.id,
        amount: input.amount,
        currency: input.currency,
        days: input.days,
        comment: input.comment || null,
      },
    }),
    // Прошлая ставка того же дизайнера уходит в историю: активной остаётся
    // одна, а весь путь вниз в открытом режиме виден.
    ...(previous
      ? [prisma.bid.update({ where: { id: previous.id }, data: { withdrawnAt: now } })]
      : []),
    prisma.order.update({ where: { id: order.id }, data: { lastActivityAt: now } }),
  ]);

  await notify({
    userId: order.customerId,
    type: 'auction_bid_placed',
    payload: {
      orderTitle: order.title,
      designer: user.nickname,
      amount: input.amount,
      currency: input.currency,
    },
    link: `/orders/${order.id}`,
  });

  // В закрытом режиме «вас обошли» не бывает: ставок соперников не видно.
  if (leaderBefore && input.amount < leaderBefore.amount) {
    await notify({
      userId: leaderBefore.designerId,
      type: 'auction_outbid',
      payload: { orderTitle: order.title, amount: input.amount, currency: input.currency },
      link: `/orders/${order.id}`,
    });
  }

  await writeAuditLog({
    action: 'auction.bid_placed',
    actorId: user.id,
    targetType: 'auction',
    targetId: auction.id,
    payload: { amount: input.amount, currency: input.currency, days: input.days },
  });

  revalidatePath(`/orders/${order.id}`);

  return successState({ message: 'orders.auction.bidPlaced' });
}

/** Отзыв своей ставки: участник выходит из торгов. */
export async function withdrawBid(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await auctionEnabled())) return { ok: false, error: 'errors.auction.disabled' };

  const auction = await prisma.auction.findUnique({
    where: { orderId },
    select: { id: true, closedAt: true, winnerBidId: true },
  });

  if (!auction) return { ok: false, error: 'errors.auction.notFound' };
  if (auction.closedAt) return { ok: false, error: 'errors.auction.closed' };

  const bid = await ownActiveBid(orderId, user.id);
  if (!bid) return { ok: false, error: 'errors.auction.noBid' };

  await prisma.bid.update({ where: { id: bid.id }, data: { withdrawnAt: new Date() } });

  await writeAuditLog({
    action: 'auction.bid_withdrawn',
    actorId: user.id,
    targetType: 'bid',
    targetId: bid.id,
  });

  revalidatePath(`/orders/${orderId}`);

  return { ok: true };
}

/**
 * Заказчик закрывает торги досрочно. Закрытые ставки при этом вскрываются:
 * выбирать победителя вслепую нельзя.
 */
export async function closeAuction(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await auctionEnabled())) return { ok: false, error: 'errors.auction.disabled' };

  const auction = await prisma.auction.findUnique({
    where: { orderId },
    select: { id: true, closedAt: true, revealedAt: true, order: { select: { customerId: true } } },
  });

  if (!auction || auction.order.customerId !== user.id) {
    return { ok: false, error: 'errors.forbidden' };
  }
  if (auction.closedAt) return { ok: false, error: 'errors.auction.closed' };

  const now = new Date();

  await prisma.auction.update({
    where: { id: auction.id },
    data: { closedAt: now, revealedAt: auction.revealedAt ?? now },
  });

  await notifyBidders(orderId, 'auction_closed');

  await writeAuditLog({
    action: 'auction.closed',
    actorId: user.id,
    targetType: 'auction',
    targetId: auction.id,
    payload: { early: true },
  });

  revalidatePath(`/orders/${orderId}`);

  return { ok: true };
}

/**
 * Заказчик выбирает победителя. Сделка ещё не создаётся: торги
 * необязывающие (§3), и победитель должен подтвердить.
 */
export async function selectWinner(bidId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await auctionEnabled())) return { ok: false, error: 'errors.auction.disabled' };

  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    select: {
      id: true,
      orderId: true,
      designerId: true,
      amount: true,
      currency: true,
      withdrawnAt: true,
      order: {
        select: {
          customerId: true,
          title: true,
          auction: {
            select: { id: true, mode: true, revealedAt: true, closedAt: true, winnerBidId: true },
          },
        },
      },
    },
  });

  if (!bid?.order.auction || bid.order.customerId !== user.id) {
    return { ok: false, error: 'errors.forbidden' };
  }
  if (bid.withdrawnAt) return { ok: false, error: 'errors.auction.bidWithdrawn' };

  const auction = bid.order.auction;
  if (auction.winnerBidId) return { ok: false, error: 'errors.auction.winnerAlreadyPicked' };

  // Выбирать по невскрытым ставкам нечего: в закрытом режиме заказчик их
  // и не видит, а значит, попытка сюда — обход интерфейса.
  if (auction.mode === 'sealed' && !auction.revealedAt) {
    return { ok: false, error: 'errors.auction.notRevealed' };
  }

  const responseHours = await getSetting('auction_winner_response_hours');
  const now = new Date();

  await prisma.auction.update({
    where: { id: auction.id },
    data: {
      winnerBidId: bid.id,
      winnerDecision: 'pending',
      winnerDeadlineAt: new Date(now.getTime() + responseHours * 60 * 60 * 1000),
      winnerRespondedAt: null,
      closedAt: auction.closedAt ?? now,
      revealedAt: auction.revealedAt ?? now,
    },
  });

  await notify({
    userId: bid.designerId,
    type: 'auction_won',
    payload: {
      orderTitle: bid.order.title,
      amount: bid.amount,
      currency: bid.currency,
      hours: responseHours,
    },
    link: `/orders/${bid.orderId}`,
    push: true,
  });

  await writeAuditLog({
    action: 'auction.winner_selected',
    actorId: user.id,
    targetType: 'auction',
    targetId: auction.id,
    payload: { bidId: bid.id, designerId: bid.designerId, amount: bid.amount },
  });

  revalidatePath(`/orders/${bid.orderId}`);

  return { ok: true };
}

/**
 * Победитель принимает торги — отсюда рождается сделка, дальше всё идёт
 * обычным путём фазы 4: план этапов, чеки, сдачи.
 */
export async function acceptWin(
  orderId: string,
): Promise<{ ok: boolean; error?: string; dealId?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await auctionEnabled())) return { ok: false, error: 'errors.auction.disabled' };

  const auction = await prisma.auction.findUnique({
    where: { orderId },
    select: {
      id: true,
      winnerDecision: true,
      winnerDeadlineAt: true,
      winnerBid: { select: { id: true, designerId: true } },
      order: { select: { id: true, status: true, customerId: true, title: true } },
    },
  });

  if (!auction?.winnerBid || auction.winnerBid.designerId !== user.id) {
    return { ok: false, error: 'errors.forbidden' };
  }
  if (auction.winnerDecision !== 'pending') return { ok: false, error: 'errors.auction.decided' };
  if (auction.winnerDeadlineAt && auction.winnerDeadlineAt <= new Date()) {
    return { ok: false, error: 'errors.auction.decisionExpired' };
  }

  await prisma.$transaction([
    prisma.auction.update({
      where: { id: auction.id },
      data: { winnerDecision: 'accepted', winnerRespondedAt: new Date() },
    }),
    prisma.order.update({
      where: { id: auction.order.id },
      data: { status: 'in_progress', lastActivityAt: new Date() },
    }),
    prisma.designerProfile.update({
      where: { userId: user.id },
      data: { auctionsWon: { increment: 1 } },
    }),
  ]);

  const deal = await createDealFromBid(auction.winnerBid.id);

  await writeAuditLog({
    action: 'auction.winner_accepted',
    actorId: user.id,
    targetType: 'auction',
    targetId: auction.id,
  });

  revalidatePath(`/orders/${orderId}`);

  return 'dealId' in deal ? { ok: true, dealId: deal.dealId } : { ok: false, error: deal.error };
}

/**
 * Победитель отказывается. Это законный исход — торги необязывающие, — но
 * он фиксируется в профиле и виден заказчикам (§3).
 */
export async function declineWin(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await auctionEnabled())) return { ok: false, error: 'errors.auction.disabled' };

  const auction = await prisma.auction.findUnique({
    where: { orderId },
    select: {
      id: true,
      winnerDecision: true,
      winnerBid: { select: { designerId: true, amount: true, currency: true } },
      order: { select: { id: true, customerId: true, title: true } },
    },
  });

  if (!auction?.winnerBid || auction.winnerBid.designerId !== user.id) {
    return { ok: false, error: 'errors.forbidden' };
  }
  if (auction.winnerDecision !== 'pending') return { ok: false, error: 'errors.auction.decided' };

  await settleDeclinedWinner(auction.id, user.id);

  await notify({
    userId: auction.order.customerId,
    type: 'auction_winner_declined',
    payload: { orderTitle: auction.order.title, designer: user.nickname },
    link: `/orders/${orderId}`,
    push: true,
  });

  await writeAuditLog({
    action: 'auction.winner_declined',
    actorId: user.id,
    targetType: 'auction',
    targetId: auction.id,
  });

  revalidatePath(`/orders/${orderId}`);

  return { ok: true };
}

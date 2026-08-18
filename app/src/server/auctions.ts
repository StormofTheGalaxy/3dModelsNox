import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';
import type { AuctionMode, AuctionWinnerDecision, DesignerLevel } from '@polyforge/db';
import { competitionLevel, type CompetitionLevel } from '@polyforge/shared';

import { notify } from './notifications';
import { getSetting } from './settings';

/**
 * Аукцион заказов (§3, post-MVP №1).
 *
 * Два режима. `open_reverse` — открытый обратный аукцион: ставки видны всем,
 * дизайнеры перебивают сами себя вниз. `sealed` — закрытые ставки: до вскрытия
 * по дедлайну каждый видит только свою, заказчик — только счётчик.
 *
 * Здесь живёт чтение и вся видимость. Правило одно: фильтруем на сервере, а не
 * в разметке — иначе закрытые ставки уедут в HTML и «закрытость» станет
 * декоративной.
 */

const BID_SELECT = {
  id: true,
  orderId: true,
  designerId: true,
  amount: true,
  currency: true,
  days: true,
  comment: true,
  withdrawnAt: true,
  createdAt: true,
  designer: {
    select: {
      nickname: true,
      designerProfile: {
        select: { level: true, rating: true, ratingCount: true, avatarUrl: true },
      },
    },
  },
} satisfies Prisma.BidSelect;

type BidRow = Prisma.BidGetPayload<{ select: typeof BID_SELECT }>;

export interface AuctionBidView {
  id: string;
  designerId: string;
  nickname: string;
  avatarUrl: string | null;
  level: DesignerLevel | null;
  rating: number | null;
  ratingCount: number;
  amount: number;
  currency: string;
  days: number | null;
  comment: string | null;
  createdAt: Date;
  isOwn: boolean;
  isWinner: boolean;
}

export interface AuctionState {
  id: string;
  orderId: string;
  mode: AuctionMode;
  startPrice: number | null;
  currency: string;
  endsAt: Date | null;
  closedAt: Date | null;
  /** Закрытые ставки уже вскрыты (у открытого режима — всегда true). */
  revealed: boolean;
  winnerDecision: AuctionWinnerDecision;
  winnerDeadlineAt: Date | null;
  winnerBidId: string | null;
  /** Точное число участников видит только заказчик — как и по откликам (§3). */
  bidderCount: number | null;
  /** Остальным — та же качественная градация, что на витрине. */
  competition: CompetitionLevel;
  /** Ставки, которые зрителю разрешено видеть, — от низкой к высокой. */
  bids: AuctionBidView[];
  /** Активная ставка самого зрителя, если он дизайнер и торгуется. */
  ownBid: AuctionBidView | null;
  /** Сколько ставок зритель уже сделал: лимит на торги — настройка. */
  ownBidCount: number;
  /** Лучшая (наименьшая) ставка, когда зрителю её видно. */
  bestAmount: number | null;
}

/**
 * Активная ставка дизайнера — последняя неотозванная. История остаётся в БД:
 * в открытом аукционе видно, как участник шёл вниз, и это часть смысла режима.
 */
function activeBids(rows: BidRow[]): BidRow[] {
  const latest = new Map<string, BidRow>();

  for (const row of rows) {
    if (row.withdrawnAt) continue;
    const previous = latest.get(row.designerId);
    if (!previous || row.createdAt > previous.createdAt) latest.set(row.designerId, row);
  }

  return [...latest.values()].sort((a, b) => a.amount - b.amount || +a.createdAt - +b.createdAt);
}

function toView(row: BidRow, viewerId: string | null, winnerBidId: string | null): AuctionBidView {
  return {
    id: row.id,
    designerId: row.designerId,
    nickname: row.designer.nickname,
    avatarUrl: row.designer.designerProfile?.avatarUrl ?? null,
    level: row.designer.designerProfile?.level ?? null,
    rating: row.designer.designerProfile?.rating ?? null,
    ratingCount: row.designer.designerProfile?.ratingCount ?? 0,
    amount: row.amount,
    currency: row.currency,
    days: row.days,
    comment: row.comment,
    createdAt: row.createdAt,
    isOwn: viewerId === row.designerId,
    isWinner: winnerBidId === row.id,
  };
}

/** Включён ли модуль торгов вообще (§1.2.2 — всё новое за feature-флагом). */
export async function auctionEnabled(): Promise<boolean> {
  return getSetting('feature_auction');
}

/**
 * Состояние торгов для зрителя. `null`, если у заказа нет аукциона.
 *
 * Гостю (`viewerId === null`) закрытые ставки не показываются никогда, а
 * открытые — показываются: витрина и так публичная, и открытость в этом
 * режиме заявлена участникам заранее.
 */
export async function getAuctionState(
  orderId: string,
  viewerId: string | null,
  isCustomer: boolean,
): Promise<AuctionState | null> {
  const auction = await prisma.auction.findUnique({
    where: { orderId },
    select: {
      id: true,
      orderId: true,
      mode: true,
      startPrice: true,
      currency: true,
      endsAt: true,
      revealedAt: true,
      closedAt: true,
      winnerBidId: true,
      winnerDecision: true,
      winnerDeadlineAt: true,
    },
  });

  if (!auction) return null;

  const rows = await prisma.bid.findMany({
    where: { orderId },
    select: BID_SELECT,
    orderBy: { createdAt: 'asc' },
  });

  const active = activeBids(rows);
  const revealed = auction.mode === 'open_reverse' || auction.revealedAt !== null;

  const ownRows = viewerId ? rows.filter((row) => row.designerId === viewerId) : [];
  const ownActive = active.find((row) => row.designerId === viewerId) ?? null;

  // Кто что видит. Заказчик закрытых ставок до вскрытия не видит тоже —
  // иначе «закрытый аукцион» превращается в аукцион, закрытый от дизайнеров.
  const visible = revealed ? active : ownActive ? [ownActive] : [];

  return {
    id: auction.id,
    orderId: auction.orderId,
    mode: auction.mode,
    startPrice: auction.startPrice,
    currency: auction.currency,
    endsAt: auction.endsAt,
    closedAt: auction.closedAt,
    revealed,
    winnerDecision: auction.winnerDecision,
    winnerDeadlineAt: auction.winnerDeadlineAt,
    winnerBidId: auction.winnerBidId,
    // После вскрытия ставки и так перечислены поимённо — прятать счётчик
    // было бы фикцией.
    bidderCount: isCustomer || revealed ? active.length : null,
    competition: competitionLevel(active.length),
    bids: visible.map((row) => toView(row, viewerId, auction.winnerBidId)),
    ownBid: ownActive ? toView(ownActive, viewerId, auction.winnerBidId) : null,
    ownBidCount: ownRows.length,
    bestAmount: revealed ? (active[0]?.amount ?? null) : null,
  };
}

/** Лучшая ставка для карточки витрины: только в открытом режиме. */
export async function bestBidForCards(
  orderIds: string[],
): Promise<Map<string, { amount: number; currency: string; bidderCount: number }>> {
  const result = new Map<string, { amount: number; currency: string; bidderCount: number }>();
  if (orderIds.length === 0) return result;

  const auctions = await prisma.auction.findMany({
    where: { orderId: { in: orderIds }, mode: 'open_reverse' },
    select: { orderId: true },
  });

  const openIds = auctions.map((auction) => auction.orderId);
  if (openIds.length === 0) return result;

  const rows = await prisma.bid.findMany({
    where: { orderId: { in: openIds } },
    select: BID_SELECT,
    orderBy: { createdAt: 'asc' },
  });

  const byOrder = new Map<string, BidRow[]>();
  for (const row of rows) {
    const list = byOrder.get(row.orderId) ?? [];
    list.push(row);
    byOrder.set(row.orderId, list);
  }

  for (const [orderId, list] of byOrder) {
    const active = activeBids(list);
    const best = active[0];
    if (best) {
      result.set(orderId, {
        amount: best.amount,
        currency: best.currency,
        bidderCount: active.length,
      });
    }
  }

  return result;
}

/** Активная ставка дизайнера — нужна серверным действиям для проверки шага. */
export async function ownActiveBid(
  orderId: string,
  designerId: string,
): Promise<{ id: string; amount: number } | null> {
  const bid = await prisma.bid.findFirst({
    where: { orderId, designerId, withdrawnAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, amount: true },
  });

  return bid;
}

/**
 * Снятие выбора после отказа победителя или истечения срока ответа.
 *
 * Живёт здесь, а не среди server actions: это внутренний переход состояния,
 * который вызывают действие отказа и воркер. Экспортируй его из `'use server'`
 * — и он станет вызываемым эндпоинтом, которому можно передать чужой id.
 */
export async function settleDeclinedWinner(
  auctionId: string,
  designerId: string,
  reason: 'declined' | 'expired' = 'declined',
): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { orderId: true, winnerBidId: true },
  });
  if (!auction) return;

  const now = new Date();

  await prisma.$transaction([
    prisma.auction.update({
      where: { id: auctionId },
      data: {
        winnerDecision: reason,
        winnerRespondedAt: now,
        // Выбор снимается, но ставка остаётся в истории: заказчик должен
        // иметь возможность выбрать следующего участника.
        winnerBidId: null,
      },
    }),
    ...(auction.winnerBidId
      ? [prisma.bid.update({ where: { id: auction.winnerBidId }, data: { withdrawnAt: now } })]
      : []),
    prisma.designerProfile.update({
      where: { userId: designerId },
      data: { auctionsDeclined: { increment: 1 } },
    }),
  ]);
}

/** Разослать всем активным участникам торгов одно и то же уведомление. */
export async function notifyBidders(
  orderId: string,
  type: 'auction_closed' | 'auction_ending_soon',
  extra: Record<string, string | number | boolean> = {},
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { title: true },
  });
  if (!order) return;

  const bids = await prisma.bid.findMany({
    where: { orderId, withdrawnAt: null },
    select: { designerId: true },
    distinct: ['designerId'],
  });

  await Promise.all(
    bids.map((bid) =>
      notify({
        userId: bid.designerId,
        type,
        payload: { orderTitle: order.title, ...extra },
        link: `/orders/${orderId}`,
      }),
    ),
  );
}

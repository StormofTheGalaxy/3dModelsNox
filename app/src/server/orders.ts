import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';
import { competitionLevel, type OrderFilter } from '@polyforge/shared';

import type { OrderCardData } from '@/components/orders/order-card';

/**
 * Витрина заказов (§4.5).
 *
 * Карточка собирается из денормализованных полей Order, а не из JSON-секций
 * ТЗ: витрина — самый нагруженный экран, и разбирать JSON на каждой карточке
 * ради типа ассета неразумно.
 */

const ORDER_CARD_SELECT = {
  id: true,
  title: true,
  assetType: true,
  styles: true,
  engine: true,
  platform: true,
  budgetMode: true,
  budgetAmount: true,
  budgetCurrency: true,
  deadline: true,
  previewUrl: true,
  responsesCount: true,
  invitedDesignerIds: true,
  publishedAt: true,
  customer: {
    select: {
      id: true,
      nickname: true,
      customerProfile: {
        select: { displayName: true, avatarUrl: true, rating: true, ratingCount: true, type: true },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderCard = Prisma.OrderGetPayload<{ select: typeof ORDER_CARD_SELECT }> & {
  competition: 'low' | 'medium' | 'high';
  isInvited: boolean;
};

function orderBy(sort: OrderFilter['sort']): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case 'budget_desc':
      // Заказы «жду предложений» уходят вниз: сравнивать их по сумме не с чем.
      return [{ budgetAmount: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }];
    case 'budget_asc':
      return [{ budgetAmount: { sort: 'asc', nulls: 'last' } }, { publishedAt: 'desc' }];
    case 'deadline':
      return [{ deadline: { sort: 'asc', nulls: 'last' } }, { publishedAt: 'desc' }];
    default:
      return [{ publishedAt: 'desc' }];
  }
}

function buildWhere(filter: OrderFilter): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    status: 'published',
    customer: { status: 'active' },
  };

  if (filter.assetType) where.assetType = filter.assetType;
  if (filter.style) where.styles = { has: filter.style };
  if (filter.engine) where.engine = { contains: filter.engine, mode: 'insensitive' };
  if (filter.currency) where.budgetCurrency = filter.currency;
  if (filter.noResponsesOnly) where.responsesCount = 0;

  if (filter.verifiedCustomersOnly) {
    where.customer = { status: 'active', emailVerifiedAt: { not: null } };
  }

  if (filter.budgetMin !== undefined || filter.budgetMax !== undefined) {
    where.budgetAmount = {
      ...(filter.budgetMin !== undefined ? { gte: filter.budgetMin } : {}),
      ...(filter.budgetMax !== undefined ? { lte: filter.budgetMax } : {}),
    };
  }

  if (filter.deadlineWithinDays !== undefined) {
    const limit = new Date(Date.now() + filter.deadlineWithinDays * 24 * 60 * 60 * 1000);
    where.deadline = { not: null, lte: limit };
  }

  if (filter.query) {
    // Поиск по денормализованной колонке: каждое слово должно встретиться.
    // Под ILIKE в миграции заведён триграммный GIN-индекс (см. ADR-0004).
    const terms = filter.query
      .split(/\s+/u)
      .filter(Boolean)
      .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean);

    if (terms.length > 0) {
      where.AND = terms.map((term) => ({
        searchText: { contains: term, mode: 'insensitive' as const },
      }));
    }
  }

  return where;
}

export async function listOrders(
  filter: OrderFilter,
  viewerId: string | null,
): Promise<{ items: OrderCard[]; nextCursor: string | null }> {
  const orders = await prisma.order.findMany({
    where: buildWhere(filter),
    orderBy: orderBy(filter.sort),
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: ORDER_CARD_SELECT,
  });

  const hasMore = orders.length > filter.limit;
  const page = hasMore ? orders.slice(0, filter.limit) : orders;

  const items = page.map((order) => ({
    ...order,
    competition: competitionLevel(order.responsesCount),
    isInvited: viewerId !== null && order.invitedDesignerIds.includes(viewerId),
  }));

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Полная карточка заказа. Гостю страница отдаёт тизер (§4.11). */
export async function getOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      ...ORDER_CARD_SELECT,
      status: true,
      customerId: true,
      briefId: true,
      expiresAt: true,
      lastActivityAt: true,
      brief: { select: { id: true, title: true, sections: true, access: true, shareToken: true } },
    },
  });
}

export async function listCustomerOrders(customerId: string) {
  return prisma.order.findMany({
    where: { customerId },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      status: true,
      responsesCount: true,
      budgetMode: true,
      budgetAmount: true,
      budgetCurrency: true,
      deadline: true,
      expiresAt: true,
      publishedAt: true,
    },
  });
}

/** Сколько активных заказов у заказчика — лимит задаётся настройкой (§4.5). */
export async function countActiveOrders(customerId: string): Promise<number> {
  return prisma.order.count({
    where: { customerId, status: { in: ['published', 'in_progress'] } },
  });
}

export async function listSavedFilters(userId: string) {
  return prisma.savedFilter.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      params: true,
      notifyEmail: true,
      notifyInApp: true,
      createdAt: true,
    },
  });
}

/**
 * Приведение записи БД к форме карточки: даты уходят на клиент строками,
 * профиль заказчика разворачивается в плоские поля.
 */
export function toOrderCardData(order: OrderCard): OrderCardData {
  return {
    id: order.id,
    title: order.title,
    assetType: order.assetType,
    styles: order.styles,
    engine: order.engine,
    budgetMode: order.budgetMode,
    budgetAmount: order.budgetAmount,
    budgetCurrency: order.budgetCurrency,
    deadline: order.deadline?.toISOString() ?? null,
    previewUrl: order.previewUrl,
    competition: order.competition,
    isInvited: order.isInvited,
    publishedAt: order.publishedAt?.toISOString() ?? null,
    customer: {
      nickname: order.customer.nickname,
      displayName: order.customer.customerProfile?.displayName ?? null,
      avatarUrl: order.customer.customerProfile?.avatarUrl ?? null,
      rating: order.customer.customerProfile?.rating ?? 0,
      ratingCount: order.customer.customerProfile?.ratingCount ?? 0,
    },
  };
}

/**
 * Текст для полнотекстового поиска. Собирается при публикации и правке —
 * витрина ищет по одной колонке вместо джойна с JSON секций.
 */
export function buildSearchText(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').slice(0, 4000);
}

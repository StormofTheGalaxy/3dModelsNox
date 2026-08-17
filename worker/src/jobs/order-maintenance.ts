import { prisma, type Prisma } from '@polyforge/db';
import { competitionLevel, type Locale } from '@polyforge/shared';

import { notifyUser } from '../notify';

/**
 * Гигиена витрины (§4.5) и дайджест сохранённых фильтров (§4.5, §4.7).
 *
 * Всё это крон-задачи воркера: они трогают много строк и не должны
 * выполняться внутри пользовательского запроса.
 */

/** Автоархив заказов без активности. Порог — настройка платформы. */
export async function archiveExpiredOrders(): Promise<number> {
  const expired = await prisma.order.findMany({
    where: { status: 'published', expiresAt: { lt: new Date() } },
    select: { id: true, customerId: true, title: true },
    take: 500,
  });

  if (expired.length === 0) return 0;

  await prisma.order.updateMany({
    where: { id: { in: expired.map((order) => order.id) } },
    data: { status: 'archived' },
  });

  for (const order of expired) {
    await notifyUser({
      userId: order.customerId,
      type: 'order_expiring',
      payload: { orderTitle: order.title },
      link: `/orders/${order.id}`,
      withEmail: true,
    });
  }

  return expired.length;
}

/**
 * Заказчик не реагирует на отклики N дней (§3): дизайнеров предупреждаем,
 * заказчику снижаем метрику отзывчивости.
 */
export async function flagInactiveCustomers(inactiveDays: number): Promise<number> {
  const threshold = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

  const stale = await prisma.orderResponse.findMany({
    where: {
      status: 'new',
      viewedAt: null,
      createdAt: { lt: threshold },
      order: { status: 'published' },
    },
    select: {
      id: true,
      designerId: true,
      order: { select: { id: true, title: true, customerId: true } },
    },
    take: 500,
  });

  if (stale.length === 0) return 0;

  const notifiedCustomers = new Set<string>();

  for (const response of stale) {
    await notifyUser({
      userId: response.designerId,
      type: 'order_customer_inactive',
      payload: { orderTitle: response.order.title, days: inactiveDays },
      link: `/orders/${response.order.id}`,
      withEmail: false,
    });

    // Метрику заказчика двигаем один раз за прогон, а не по числу откликов.
    if (!notifiedCustomers.has(response.order.customerId)) {
      notifiedCustomers.add(response.order.customerId);

      await prisma.customerProfile
        .updateMany({
          where: { userId: response.order.customerId },
          data: { responsivenessScore: { decrement: 5 } },
        })
        .catch(() => undefined);
    }
  }

  return stale.length;
}

interface SavedFilterParams {
  assetType?: string;
  style?: string;
  engine?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  query?: string;
}

/** Заказы, подходящие под сохранённый фильтр и появившиеся после курсора. */
function whereForFilter(params: SavedFilterParams, since: Date): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    status: 'published',
    publishedAt: { gt: since },
    customer: { status: 'active' },
  };

  if (params.assetType) where.assetType = params.assetType as Prisma.OrderWhereInput['assetType'];
  if (params.style) where.styles = { has: params.style as never };
  if (params.engine) where.engine = { contains: params.engine, mode: 'insensitive' };
  if (params.currency) where.budgetCurrency = params.currency;
  if (params.query) where.searchText = { contains: params.query, mode: 'insensitive' };

  if (params.budgetMin !== undefined || params.budgetMax !== undefined) {
    where.budgetAmount = {
      ...(params.budgetMin !== undefined ? { gte: params.budgetMin } : {}),
      ...(params.budgetMax !== undefined ? { lte: params.budgetMax } : {}),
    };
  }

  return where;
}

/**
 * Рассылка по сохранённым фильтрам (§4.5).
 *
 * Курсор `lastNotifiedAt` двигается всегда, даже когда совпадений нет:
 * иначе после паузы в рассылке пользователь получил бы письмо про заказы
 * недельной давности.
 */
export async function dispatchSavedFilterMatches(): Promise<number> {
  const filters = await prisma.savedFilter.findMany({
    where: { OR: [{ notifyEmail: true }, { notifyInApp: true }] },
    select: {
      id: true,
      userId: true,
      title: true,
      params: true,
      notifyEmail: true,
      lastNotifiedAt: true,
      user: { select: { locale: true, status: true } },
    },
    take: 1000,
  });

  let delivered = 0;
  const now = new Date();

  for (const filter of filters) {
    if (filter.user.status !== 'active') continue;

    const params = (filter.params ?? {}) as SavedFilterParams;

    const matches = await prisma.order.findMany({
      where: {
        ...whereForFilter(params, filter.lastNotifiedAt),
        // Свои же заказы в дайджест не попадают.
        customerId: { not: filter.userId },
      },
      orderBy: { publishedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, responsesCount: true },
    });

    await prisma.savedFilter.update({
      where: { id: filter.id },
      data: { lastNotifiedAt: now },
    });

    if (matches.length === 0) continue;

    const first = matches[0]!;

    await notifyUser({
      userId: filter.userId,
      type: 'order_new_match',
      payload: {
        filterTitle: filter.title,
        orderTitle: first.title,
        count: matches.length,
        competition: competitionLevel(first.responsesCount),
      },
      link: matches.length === 1 ? `/orders/${first.id}` : '/orders',
      withEmail: filter.notifyEmail,
      locale: filter.user.locale as Locale,
    });

    delivered += 1;
  }

  return delivered;
}

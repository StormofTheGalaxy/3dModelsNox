import 'server-only';

import { prisma } from '@polyforge/db';

/**
 * Метрики дашборда админки (§4.10).
 *
 * Считаются запросами по требованию, без витрин и материализованных
 * представлений: на объёмах беты это доли секунды, а лишний слой данных
 * пришлось бы поддерживать в актуальном состоянии.
 */

export interface DashboardStats {
  users: { total: number; newInPeriod: number; active: number; banned: number };
  orders: { published: number; newInPeriod: number; responses: number };
  deals: Record<string, number>;
  money: { confirmed: number; claimed: number };
  disputes: { open: number; resolved: number };
  moderation: { reports: number; verifications: number };
  /** Регистрации по дням — для спарклайна. */
  registrations: { date: string; count: number }[];
}

export async function dashboardStats(days = 30): Promise<DashboardStats> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [
    totalUsers,
    newUsers,
    activeUsers,
    bannedUsers,
    publishedOrders,
    newOrders,
    responses,
    dealsByStatus,
    confirmedPayments,
    claimedPayments,
    openDisputes,
    resolvedDisputes,
    openReports,
    pendingVerifications,
    registrationRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    // DAU-подобная метрика: заходил за последние сутки.
    prisma.user.count({ where: { lastSeenAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    prisma.user.count({ where: { status: { in: ['banned', 'temp_banned', 'shadow_banned'] } } }),
    prisma.order.count({ where: { status: 'published' } }),
    prisma.order.count({ where: { createdAt: { gte: since } } }),
    prisma.orderResponse.count({ where: { createdAt: { gte: since } } }),
    prisma.deal.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.paymentConfirmation.aggregate({
      where: { status: 'confirmed', customerClaimedAt: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.paymentConfirmation.aggregate({
      where: { status: { in: ['pending', 'stuck'] } },
      _sum: { amount: true },
    }),
    prisma.dispute.count({ where: { status: 'open' } }),
    prisma.dispute.count({ where: { status: 'resolved' } }),
    prisma.report.count({ where: { status: 'open' } }),
    prisma.verificationRequest.count({ where: { status: 'submitted' } }),
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
      FROM users
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  return {
    users: {
      total: totalUsers,
      newInPeriod: newUsers,
      active: activeUsers,
      banned: bannedUsers,
    },
    orders: { published: publishedOrders, newInPeriod: newOrders, responses },
    deals: Object.fromEntries(dealsByStatus.map((row) => [row.status, row._count._all])),
    money: {
      // Суммы складываются как есть: мультивалютность беты — это единицы
      // сделок, и разделять их на дашборде пока нечего.
      confirmed: confirmedPayments._sum.amount ?? 0,
      claimed: claimedPayments._sum.amount ?? 0,
    },
    disputes: { open: openDisputes, resolved: resolvedDisputes },
    moderation: { reports: openReports, verifications: pendingVerifications },
    registrations: registrationRows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      count: Number(row.count),
    })),
  };
}

/** Сделки, требующие внимания администратора (§4.10). */
export async function attentionDeals() {
  const now = new Date();

  const [stuckPayments, overdue] = await Promise.all([
    prisma.paymentConfirmation.findMany({
      where: { status: 'stuck' },
      orderBy: { customerClaimedAt: 'asc' },
      take: 50,
      select: {
        id: true,
        amount: true,
        currency: true,
        customerClaimedAt: true,
        reminderCount: true,
        milestone: {
          select: {
            title: true,
            deal: {
              select: {
                id: true,
                title: true,
                customer: { select: { nickname: true } },
                designer: { select: { nickname: true } },
              },
            },
          },
        },
      },
    }),
    prisma.milestone.findMany({
      where: {
        status: { in: ['in_work', 'revision'] },
        dueDate: { lt: now },
        deal: { status: 'active' },
      },
      orderBy: { dueDate: 'asc' },
      take: 50,
      select: {
        id: true,
        title: true,
        dueDate: true,
        deal: {
          select: {
            id: true,
            title: true,
            customer: { select: { nickname: true } },
            designer: { select: { nickname: true } },
          },
        },
      },
    }),
  ]);

  return { stuckPayments, overdue };
}

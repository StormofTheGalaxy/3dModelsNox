import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';
import { SPECIALIZATIONS, type Specialization } from '@polyforge/shared';

import { getSetting } from './settings';

/**
 * Лидерборды (§4.8).
 *
 * Ранжирование идёт по рейтингу и числу закрытых сделок вместе: один только
 * рейтинг выводит наверх дизайнера с единственной пятёркой, а одно только
 * число сделок — того, кто берёт всё подряд.
 */

export type LeaderboardPeriod = 'month' | 'all';

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  level: string;
  rating: number;
  ratingCount: number;
  dealsCompleted: number;
  specializations: string[];
}

export async function leaderboard(options: {
  period: LeaderboardPeriod;
  specialization?: Specialization;
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  const limit = options.limit ?? 20;

  const since =
    options.period === 'month' ? new Date(Date.now() - 30 * 86_400_000) : undefined;

  const where: Prisma.DesignerProfileWhereInput = {
    user: { status: 'active' },
    completedAt: { not: null },
    ratingCount: { gt: 0 },
  };

  if (options.specialization) {
    where.specializations = { has: options.specialization };
  }

  const profiles = await prisma.designerProfile.findMany({
    where,
    // Кандидатов берём с запасом: месячный срез считается уже в приложении,
    // потому что сделки за период не лежат в профиле.
    take: options.period === 'month' ? 200 : limit,
    orderBy: [{ rating: 'desc' }, { ordersCompleted: 'desc' }],
    select: {
      userId: true,
      avatarUrl: true,
      level: true,
      rating: true,
      ratingCount: true,
      ordersCompleted: true,
      specializations: true,
      user: { select: { nickname: true } },
    },
  });

  if (!since) {
    return profiles.slice(0, limit).map((profile) => ({
      userId: profile.userId,
      nickname: profile.user.nickname,
      avatarUrl: profile.avatarUrl,
      level: profile.level,
      rating: profile.rating,
      ratingCount: profile.ratingCount,
      dealsCompleted: profile.ordersCompleted,
      specializations: profile.specializations,
    }));
  }

  const monthly = await prisma.deal.groupBy({
    by: ['designerId'],
    where: {
      status: 'completed',
      completedAt: { gte: since },
      designerId: { in: profiles.map((profile) => profile.userId) },
    },
    _count: { _all: true },
  });

  const counts = new Map(monthly.map((row) => [row.designerId, row._count._all]));

  return profiles
    .map((profile) => ({
      userId: profile.userId,
      nickname: profile.user.nickname,
      avatarUrl: profile.avatarUrl,
      level: profile.level,
      rating: profile.rating,
      ratingCount: profile.ratingCount,
      dealsCompleted: counts.get(profile.userId) ?? 0,
      specializations: profile.specializations,
    }))
    // За месяц ранжируем по числу закрытых сделок, при равенстве — по рейтингу.
    .filter((entry) => entry.dealsCompleted > 0)
    .sort((a, b) => b.dealsCompleted - a.dealsCompleted || b.rating - a.rating)
    .slice(0, limit);
}

/** «Дизайнер недели» — назначается админом, id лежит в настройках (§4.8). */
export async function designerOfTheWeek(): Promise<LeaderboardEntry | null> {
  const userId = await getSetting('featured_designer_userId');
  if (!userId) return null;

  const profile = await prisma.designerProfile.findUnique({
    where: { userId },
    select: {
      userId: true,
      avatarUrl: true,
      level: true,
      rating: true,
      ratingCount: true,
      ordersCompleted: true,
      specializations: true,
      user: { select: { nickname: true, status: true } },
    },
  });

  // Назначенный дизайнер мог быть забанен после назначения.
  if (!profile || profile.user.status !== 'active') return null;

  return {
    userId: profile.userId,
    nickname: profile.user.nickname,
    avatarUrl: profile.avatarUrl,
    level: profile.level,
    rating: profile.rating,
    ratingCount: profile.ratingCount,
    dealsCompleted: profile.ordersCompleted,
    specializations: profile.specializations,
  };
}

export const LEADERBOARD_SPECIALIZATIONS = SPECIALIZATIONS;

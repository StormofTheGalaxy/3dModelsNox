import 'server-only';

import { prisma } from '@polyforge/db';
import {
  ACHIEVEMENTS,
  tierForValue,
  tierRank,
  weightedRating,
  type AchievementMetric,
  type SettingValue,
} from '@polyforge/shared';

import { getSetting } from './settings';

/**
 * Репутация (§4.8): рейтинг, уровни, достижения.
 *
 * Всё пересчитывается из первичных данных, а не накапливается инкрементами:
 * рейтинг с затуханием всё равно меняется со временем сам по себе, поэтому
 * «прибавить одну оценку к среднему» тут в принципе не работает.
 */

/** Пересчёт рейтинга пользователя по опубликованным отзывам. */
export async function recomputeRating(userId: string): Promise<{ rating: number; count: number }> {
  const halfLife = await getSetting('rating_half_life_days');

  const reviews = await prisma.review.findMany({
    where: { targetId: userId, status: 'published', publishedAt: { not: null } },
    select: { overall: true, publishedAt: true, targetRole: true },
  });

  const designerReviews = reviews.filter((review) => review.targetRole === 'designer');
  const customerReviews = reviews.filter((review) => review.targetRole === 'customer');

  const designer = weightedRating(
    designerReviews.map((review) => ({ overall: review.overall, publishedAt: review.publishedAt! })),
    halfLife,
  );
  const customer = weightedRating(
    customerReviews.map((review) => ({ overall: review.overall, publishedAt: review.publishedAt! })),
    halfLife,
  );

  await prisma.designerProfile.updateMany({
    where: { userId },
    data: { rating: designer.rating, ratingCount: designer.count },
  });

  await prisma.customerProfile.updateMany({
    where: { userId },
    data: { rating: customer.rating, ratingCount: customer.count },
  });

  return designer;
}

type LevelRules = SettingValue<'level_rules'>;

export interface LevelSnapshot {
  ordersCompleted: number;
  rating: number;
  onTimePct: number;
  disputesLostRecent: number;
  verified: boolean;
}

/**
 * Уровень по метрикам (§3).
 *
 * `top` не выдаётся автоматически: ТЗ описывает его как полуавтомат с квотой
 * и утверждением админом, поэтому функция возвращает максимум `pro`, а
 * кандидатов в `top` собирает отдельный запрос для админки.
 */
export function levelFor(snapshot: LevelSnapshot, rules: LevelRules): 'novice' | 'verified' | 'pro' {
  const meetsPro =
    snapshot.ordersCompleted >= rules.pro.ordersCompleted &&
    snapshot.rating >= rules.pro.rating &&
    snapshot.onTimePct >= rules.pro.onTimePct &&
    snapshot.disputesLostRecent <= rules.pro.disputesLostMax;

  if (meetsPro) return 'pro';
  return snapshot.verified ? 'verified' : 'novice';
}

/**
 * Пересчёт уровня одного дизайнера.
 *
 * `top` снимается только вместе с проседанием метрик ниже `pro`: уровень
 * выдаётся вручную, и автоматика не должна отбирать его за один слабый месяц.
 */
export async function recomputeLevel(userId: string): Promise<string | null> {
  const rules = await getSetting('level_rules');

  const profile = await prisma.designerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      level: true,
      verifiedAt: true,
      rating: true,
      onTimePct: true,
      ordersCompleted: true,
    },
  });

  if (!profile) return null;

  const windowStart = new Date(
    Date.now() - rules.pro.disputesLostWindowDays * 86_400_000,
  );

  const disputesLostRecent = await prisma.dispute.count({
    where: {
      status: 'resolved',
      verdict: 'customer_right',
      resolvedAt: { gte: windowStart },
      deal: { designerId: userId },
    },
  });

  const computed = levelFor(
    {
      ordersCompleted: profile.ordersCompleted,
      rating: profile.rating,
      onTimePct: profile.onTimePct ?? 0,
      disputesLostRecent,
      verified: Boolean(profile.verifiedAt),
    },
    rules,
  );

  // Ручной `top` держится, пока метрики не упали ниже `pro`.
  const next = profile.level === 'top' && computed === 'pro' ? 'top' : computed;
  if (next === profile.level) return profile.level;

  await prisma.designerProfile.update({
    where: { id: profile.id },
    data: { level: next },
  });

  return next;
}

/** Счётчики метрик достижений одним проходом (§4.8). */
export async function achievementMetrics(
  userId: string,
): Promise<Record<AchievementMetric, number>> {
  const [
    dealsCompleted,
    worksPublished,
    reviewsFiveStar,
    responsesSent,
    ordersPublished,
    briefsCreated,
    disputesWon,
    deals,
  ] = await Promise.all([
    prisma.deal.count({ where: { designerId: userId, status: 'completed' } }),
    prisma.portfolioWork.count({ where: { designerId: userId, isHidden: false } }),
    prisma.review.count({ where: { targetId: userId, status: 'published', overall: 5 } }),
    prisma.orderResponse.count({ where: { designerId: userId } }),
    prisma.order.count({ where: { customerId: userId, status: { not: 'draft' } } }),
    prisma.brief.count({ where: { ownerId: userId } }),
    prisma.dispute.count({
      where: {
        status: 'resolved',
        OR: [
          { verdict: 'designer_right', deal: { designerId: userId } },
          { verdict: 'customer_right', deal: { customerId: userId } },
        ],
      },
    }),
    prisma.deal.findMany({
      where: {
        status: 'completed',
        OR: [{ designerId: userId }, { customerId: userId }],
      },
      select: {
        currency: true,
        customerId: true,
        designerId: true,
        milestones: {
          select: { wasLate: true, revisionRoundsUsed: true, submittedAt: true },
        },
      },
    }),
  ]);

  const asDesigner = deals.filter((deal) => deal.designerId === userId);

  // Повторные клиенты: заказчик, с которым закрыто больше одной сделки.
  const clients = new Map<string, number>();
  for (const deal of asDesigner) {
    clients.set(deal.customerId, (clients.get(deal.customerId) ?? 0) + 1);
  }
  const repeatClients = [...clients.values()].filter((count) => count > 1).length;

  // Подряд сданные в срок этапы — считаем с конца истории.
  const submissions = asDesigner
    .flatMap((deal) => deal.milestones)
    .filter((milestone) => milestone.submittedAt)
    .sort((a, b) => (a.submittedAt!.getTime() < b.submittedAt!.getTime() ? -1 : 1));

  let onTimeStreak = 0;
  for (const milestone of [...submissions].reverse()) {
    if (milestone.wasLate) break;
    onTimeStreak += 1;
  }

  // Ночная сдача — по UTC: часовой пояс дизайнера платформе неизвестен,
  // а достижение шуточное и от точности не зависит.
  const nightDeliveries = submissions.filter((milestone) => {
    const hour = milestone.submittedAt!.getUTCHours();
    return hour >= 23 || hour < 5;
  }).length;

  const revisionFreeDeals = asDesigner.filter((deal) =>
    deal.milestones.every((milestone) => milestone.revisionRoundsUsed === 0),
  ).length;

  const currencies = new Set(deals.map((deal) => deal.currency)).size;

  return {
    dealsCompleted,
    worksPublished,
    reviewsFiveStar,
    onTimeStreak,
    ordersPublished,
    responsesSent,
    repeatClients,
    briefsCreated,
    disputesWon,
    nightDeliveries,
    currencies,
    revisionFreeDeals,
  };
}

export interface GrantedAchievement {
  key: string;
  tier: string;
  progress: number;
}

/**
 * Выдача достижений по текущим метрикам.
 *
 * Возвращает только то, что выдано или выросло в тире — на это UI показывает
 * тост с конфетти. Повторный прогон ничего не выдаёт заново.
 */
export async function grantAchievements(userId: string): Promise<GrantedAchievement[]> {
  const metrics = await achievementMetrics(userId);

  const existing = await prisma.userAchievement.findMany({
    where: { userId },
    select: { key: true, tier: true },
  });

  const owned = new Map(existing.map((entry) => [entry.key, entry.tier]));
  const granted: GrantedAchievement[] = [];

  for (const definition of ACHIEVEMENTS) {
    const value = metrics[definition.metric];
    const tier = tierForValue(definition, value);
    if (!tier) continue;

    const current = owned.get(definition.key);
    if (current && tierRank(current as never) >= tierRank(tier)) continue;

    await prisma.userAchievement.upsert({
      where: { userId_key: { userId, key: definition.key } },
      create: { userId, key: definition.key, tier, progress: value },
      // Тир вырос — тост показываем снова, поэтому `seenAt` сбрасывается.
      update: { tier, progress: value, seenAt: null },
    });

    granted.push({ key: definition.key, tier, progress: value });
  }

  return granted;
}

/** Достижения пользователя с прогрессом — для полки и профиля. */
export async function listAchievements(userId: string) {
  const [owned, metrics] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId },
      select: { key: true, tier: true, progress: true, featured: true, grantedAt: true },
    }),
    achievementMetrics(userId),
  ]);

  const byKey = new Map(owned.map((entry) => [entry.key, entry]));

  return ACHIEVEMENTS.map((definition) => ({
    definition,
    owned: byKey.get(definition.key) ?? null,
    value: metrics[definition.metric],
  }));
}

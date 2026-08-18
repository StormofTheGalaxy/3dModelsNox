import { prisma } from '@polyforge/db';
import { ACHIEVEMENTS, tierForValue, tierRank, weightedRating } from '@polyforge/shared';

import { notifyUser } from '../notify';

/**
 * Репутация в воркере (§4.8): еженедельный пересчёт уровней и рейтингов,
 * публикация отзывов по сроку, выдача достижений.
 *
 * Эти задачи трогают всех пользователей разом и потому не имеют права
 * выполняться внутри пользовательского запроса.
 */

async function setting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return (row?.value as T | undefined) ?? fallback;
}

/**
 * Публикация отзывов, у которых вышел срок ожидания второй стороны (§4.8).
 *
 * Если вторая сторона так и не написала, отзыв всё равно публикуется:
 * иначе молчанием можно было бы вечно прятать плохую оценку.
 */
export async function publishExpiredReviews(): Promise<number> {
  const blindDays = await setting<number>('review_blind_days', 14);
  const threshold = new Date(Date.now() - blindDays * 86_400_000);

  const due = await prisma.review.findMany({
    where: { status: 'hidden_pending', createdAt: { lte: threshold } },
    select: { id: true, targetId: true, authorId: true, dealId: true },
    take: 500,
  });

  if (due.length === 0) return 0;

  await prisma.review.updateMany({
    where: { id: { in: due.map((review) => review.id) } },
    data: { status: 'published', publishedAt: new Date() },
  });

  const targets = new Set(due.map((review) => review.targetId));
  for (const targetId of targets) {
    await recomputeRatingFor(targetId);

    await notifyUser({
      userId: targetId,
      type: 'review_published',
      payload: { days: blindDays },
      link: '/dashboard',
      withEmail: true,
    });
  }

  return due.length;
}

/** Взвешенный рейтинг одного пользователя по опубликованным отзывам. */
export async function recomputeRatingFor(userId: string): Promise<void> {
  const halfLife = await setting<number>('rating_half_life_days', 180);

  const reviews = await prisma.review.findMany({
    where: { targetId: userId, status: 'published', publishedAt: { not: null } },
    select: { overall: true, publishedAt: true, targetRole: true },
  });

  const forRole = (role: 'designer' | 'customer') =>
    weightedRating(
      reviews
        .filter((review) => review.targetRole === role)
        .map((review) => ({ overall: review.overall, publishedAt: review.publishedAt! })),
      halfLife,
    );

  const designer = forRole('designer');
  const customer = forRole('customer');

  await prisma.designerProfile.updateMany({
    where: { userId },
    data: { rating: designer.rating, ratingCount: designer.count },
  });

  await prisma.customerProfile.updateMany({
    where: { userId },
    data: { rating: customer.rating, ratingCount: customer.count },
  });
}

interface LevelRules {
  pro: {
    ordersCompleted: number;
    rating: number;
    onTimePct: number;
    disputesLostWindowDays: number;
    disputesLostMax: number;
  };
  top: { ordersCompleted: number; rating: number; onTimePct: number; quotaPct: number };
}

/**
 * Еженедельный пересчёт уровней (§3).
 *
 * Ручной `top` не снимается автоматикой, пока метрики держатся на уровне
 * `pro`: уровень выдаёт админ, и отбирать его за один слабый месяц неверно.
 */
export async function recomputeLevels(): Promise<number> {
  const rules = await setting<LevelRules>('level_rules', {
    pro: {
      ordersCompleted: 15,
      rating: 4.5,
      onTimePct: 85,
      disputesLostWindowDays: 90,
      disputesLostMax: 0,
    },
    top: { ordersCompleted: 40, rating: 4.8, onTimePct: 95, quotaPct: 5 },
  });

  const profiles = await prisma.designerProfile.findMany({
    select: {
      id: true,
      userId: true,
      level: true,
      verifiedAt: true,
      rating: true,
      onTimePct: true,
      ordersCompleted: true,
    },
  });

  const windowStart = new Date(Date.now() - rules.pro.disputesLostWindowDays * 86_400_000);
  let changed = 0;

  for (const profile of profiles) {
    const disputesLostRecent = await prisma.dispute.count({
      where: {
        status: 'resolved',
        verdict: 'customer_right',
        resolvedAt: { gte: windowStart },
        deal: { designerId: profile.userId },
      },
    });

    const meetsPro =
      profile.ordersCompleted >= rules.pro.ordersCompleted &&
      profile.rating >= rules.pro.rating &&
      (profile.onTimePct ?? 0) >= rules.pro.onTimePct &&
      disputesLostRecent <= rules.pro.disputesLostMax;

    const computed = meetsPro ? 'pro' : profile.verifiedAt ? 'verified' : 'novice';
    const next = profile.level === 'top' && computed === 'pro' ? 'top' : computed;

    if (next === profile.level) continue;

    await prisma.designerProfile.update({ where: { id: profile.id }, data: { level: next } });

    await notifyUser({
      userId: profile.userId,
      type: 'level_changed',
      payload: { level: next },
      link: '/profile/designer',
      withEmail: true,
    });

    changed += 1;
  }

  return changed;
}

/**
 * Выдача достижений (§4.8).
 *
 * Прогон идёт по пользователям с активностью за период: считать метрики
 * всей базы каждый раз незачем, а достижение и так не срочное.
 */
export async function grantAchievementsBatch(sinceDays = 8): Promise<number> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);

  const active = await prisma.user.findMany({
    where: {
      status: 'active',
      OR: [
        { dealsAsDesigner: { some: { updatedAt: { gte: since } } } },
        { dealsAsCustomer: { some: { updatedAt: { gte: since } } } },
        { works: { some: { updatedAt: { gte: since } } } },
        { responses: { some: { createdAt: { gte: since } } } },
      ],
    },
    select: { id: true },
    take: 2000,
  });

  let granted = 0;

  for (const user of active) {
    const metrics = await metricsFor(user.id);

    const owned = await prisma.userAchievement.findMany({
      where: { userId: user.id },
      select: { key: true, tier: true },
    });
    const byKey = new Map(owned.map((entry) => [entry.key, entry.tier]));

    for (const definition of ACHIEVEMENTS) {
      const value = metrics[definition.metric] ?? 0;
      const tier = tierForValue(definition, value);
      if (!tier) continue;

      const current = byKey.get(definition.key);
      if (current && tierRank(current as never) >= tierRank(tier)) continue;

      await prisma.userAchievement.upsert({
        where: { userId_key: { userId: user.id, key: definition.key } },
        create: { userId: user.id, key: definition.key, tier, progress: value },
        update: { tier, progress: value, seenAt: null },
      });

      await notifyUser({
        userId: user.id,
        type: 'achievement_granted',
        payload: { key: definition.key, tier },
        link: '/achievements',
        withEmail: false,
      });

      granted += 1;
    }
  }

  return granted;
}

/** Метрики достижений одного пользователя. */
async function metricsFor(userId: string): Promise<Record<string, number>> {
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
      where: { status: 'completed', OR: [{ designerId: userId }, { customerId: userId }] },
      select: {
        currency: true,
        customerId: true,
        designerId: true,
        milestones: { select: { wasLate: true, revisionRoundsUsed: true, submittedAt: true } },
      },
    }),
  ]);

  const asDesigner = deals.filter((deal) => deal.designerId === userId);

  const clients = new Map<string, number>();
  for (const deal of asDesigner) {
    clients.set(deal.customerId, (clients.get(deal.customerId) ?? 0) + 1);
  }

  const submissions = asDesigner
    .flatMap((deal) => deal.milestones)
    .filter((milestone) => milestone.submittedAt)
    .sort((a, b) => a.submittedAt!.getTime() - b.submittedAt!.getTime());

  let onTimeStreak = 0;
  for (const milestone of [...submissions].reverse()) {
    if (milestone.wasLate) break;
    onTimeStreak += 1;
  }

  return {
    dealsCompleted,
    worksPublished,
    reviewsFiveStar,
    onTimeStreak,
    ordersPublished,
    responsesSent,
    repeatClients: [...clients.values()].filter((count) => count > 1).length,
    briefsCreated,
    disputesWon,
    nightDeliveries: submissions.filter((milestone) => {
      const hour = milestone.submittedAt!.getUTCHours();
      return hour >= 23 || hour < 5;
    }).length,
    currencies: new Set(deals.map((deal) => deal.currency)).size,
    revisionFreeDeals: asDesigner.filter((deal) =>
      deal.milestones.every((milestone) => milestone.revisionRoundsUsed === 0),
    ).length,
  };
}

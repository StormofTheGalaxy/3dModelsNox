'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';

import { getCurrentUser } from '../auth/session';

/**
 * Достижения (§4.8): полка, избранные у ника, отметка о показанном тосте.
 */

/** Тост показан — второй раз конфетти не летит. */
export async function markAchievementsSeen(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await prisma.userAchievement.updateMany({
    where: { userId: user.id, seenAt: null },
    data: { seenAt: new Date() },
  });

  return { ok: true };
}

/** Максимум избранных достижений у ника (§3: 3–5 штук). */
const FEATURED_MAX = 5;

export async function toggleFeaturedAchievement(
  key: string,
): Promise<{ ok: boolean; error?: string; featured?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const achievement = await prisma.userAchievement.findUnique({
    where: { userId_key: { userId: user.id, key } },
    select: { id: true, featured: true },
  });

  if (!achievement) return { ok: false, error: 'errors.notFound' };

  if (!achievement.featured) {
    const featuredCount = await prisma.userAchievement.count({
      where: { userId: user.id, featured: true },
    });

    if (featuredCount >= FEATURED_MAX) {
      return { ok: false, error: 'errors.achievements.tooManyFeatured' };
    }
  }

  await prisma.userAchievement.update({
    where: { id: achievement.id },
    data: { featured: !achievement.featured },
  });

  revalidatePath('/achievements');
  return { ok: true, featured: !achievement.featured };
}

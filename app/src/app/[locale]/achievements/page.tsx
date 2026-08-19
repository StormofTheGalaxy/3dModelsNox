import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';
import type { Locale } from '@polyforge/shared';

import { AchievementShelf } from '@/components/achievements/achievement-shelf';
import { AchievementToast } from '@/components/achievements/achievement-toast';
import { achievementLabels } from '@/server/achievement-labels';
import { redirectToLogin } from '@/server/auth/redirects';
import { getCurrentUser } from '@/server/auth/session';
import { listAchievements } from '@/server/reputation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'achievements' });
  return { title: t('title') };
}

/** Полка достижений (§4.8): прогресс, редкость, скрытые слоты «???». */
export default async function AchievementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirectToLogin(locale, `/${locale}/achievements`);

  const [entries, t, totals, unseen] = await Promise.all([
    listAchievements(user.id),
    getTranslations('achievements'),
    // Редкость: «есть у N %» — доля активных пользователей с этим ключом.
    prisma.userAchievement.groupBy({ by: ['key'], _count: { _all: true } }),
    prisma.userAchievement.findMany({
      where: { userId: user.id, seenAt: null },
      select: { key: true, tier: true },
    }),
  ]);

  const labels = await achievementLabels(
    entries.map((entry) => entry.definition),
    locale as Locale,
  );

  const usersCount = await prisma.user.count({ where: { status: 'active' } });
  const rarity = new Map(
    totals.map((row) => [
      row.key,
      usersCount === 0 ? 0 : Math.round((row._count._all / usersCount) * 100),
    ]),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AchievementToast granted={unseen} />

      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <p className="mb-6 text-sm text-fg-muted">{t('description')}</p>

      <AchievementShelf
        entries={entries.map((entry) => ({
          key: entry.definition.key,
          title: labels.get(entry.definition.key)?.title ?? entry.definition.key,
          description: labels.get(entry.definition.key)?.description ?? '',
          icon: entry.definition.icon,
          isHidden: Boolean(entry.definition.isHidden),
          thresholds: entry.definition.thresholds,
          value: entry.value,
          rarity: rarity.get(entry.definition.key) ?? 0,
          owned: entry.owned
            ? {
                tier: entry.owned.tier,
                featured: entry.owned.featured,
                grantedAt: entry.owned.grantedAt.toISOString(),
              }
            : null,
        }))}
        locale={locale}
      />
    </div>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@polyforge/shared';

import { AchievementBuilder } from '@/components/admin/achievement-builder';
import { achievementLabels } from '@/server/achievement-labels';
import {
  achievementBuilderEnabled,
  achievementCatalog,
  achievementRarity,
} from '@/server/achievements';
import { getCurrentUser } from '@/server/auth/session';
import { prisma } from '@polyforge/db';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Конструктор достижений (§3, post-MVP №9).
 *
 * Раздел виден всегда: редкость и включение стандартного набора нужны и
 * без конструктора. За флагом — только создание собственных достижений.
 */
export default async function AdminAchievementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (user?.role !== 'admin') notFound();

  const [catalog, rarity, builderOn, t] = await Promise.all([
    achievementCatalog(),
    achievementRarity(),
    achievementBuilderEnabled(),
    getTranslations('admin.achievements'),
  ]);

  const [labels, rows] = await Promise.all([
    achievementLabels(catalog, locale as Locale),
    prisma.achievement.findMany({ select: { id: true, key: true } }),
  ]);

  const idByKey = new Map(rows.map((row) => [row.key, row.id]));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('description')}</p>
      </div>

      <AchievementBuilder
        builderEnabled={builderOn}
        items={catalog.map((entry) => ({
          id: idByKey.get(entry.key) ?? entry.key,
          key: entry.key,
          title: labels.get(entry.key)?.title ?? entry.key,
          description: labels.get(entry.key)?.description ?? '',
          audience: entry.audience,
          metric: entry.metric,
          thresholds: entry.thresholds,
          icon: entry.icon,
          isHidden: entry.isHidden,
          isSystem: entry.isSystem,
          isEnabled: entry.isEnabled,
          holders: rarity.get(entry.key)?.holders ?? 0,
          percent: rarity.get(entry.key)?.percent ?? 0,
          titleRu: entry.title?.ru ?? '',
          titleEn: entry.title?.en ?? '',
          descriptionRu: entry.description?.ru ?? '',
          descriptionEn: entry.description?.en ?? '',
        }))}
      />
    </div>
  );
}

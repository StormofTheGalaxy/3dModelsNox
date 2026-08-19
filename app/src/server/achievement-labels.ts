import 'server-only';

import { getTranslations } from 'next-intl/server';

import type { Locale } from '@polyforge/shared';

import type { CatalogEntry } from './achievements';

/**
 * Подписи достижения на языке зрителя (§3, post-MVP №9).
 *
 * У стандартных достижений текст живёт в словарях и переводится вместе с
 * остальным интерфейсом. У собственных его вводит админ сразу на двух
 * языках — переводить их машинно незачем: это короткие строки, которые
 * автор всё равно формулирует сам.
 */
export async function achievementLabels(
  entries: CatalogEntry[],
  locale: Locale,
): Promise<Map<string, { title: string; description: string }>> {
  const t = await getTranslations({ locale, namespace: 'achievements.items' });
  const labels = new Map<string, { title: string; description: string }>();

  for (const entry of entries) {
    if (entry.title && entry.description) {
      labels.set(entry.key, {
        title: entry.title[locale],
        description: entry.description[locale],
      });
      continue;
    }

    // Системное достижение без записи в словаре — это недосмотр при
    // добавлении, но полка из-за него падать не должна.
    labels.set(entry.key, {
      title: t.has(`${entry.key}.title`) ? t(`${entry.key}.title`) : entry.key,
      description: t.has(`${entry.key}.description`) ? t(`${entry.key}.description`) : '',
    });
  }

  return labels;
}

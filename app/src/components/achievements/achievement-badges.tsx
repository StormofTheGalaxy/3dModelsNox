'use client';

import { useTranslations } from 'next-intl';

import { achievementIcon } from '@/components/achievements/achievement-icon';
import { cn } from '@/lib/utils';

/**
 * Избранные достижения у ника (§3): до пяти иконок с подсказкой.
 *
 * Только иконки, без подписей: полка со всеми подробностями живёт на
 * отдельной странице, а здесь это украшение рядом с именем.
 */

const TIER_CLASS = {
  bronze: 'text-[var(--pf-warning)]',
  silver: 'text-fg-muted',
  gold: 'text-accent',
} as const;

export function AchievementBadges({
  achievements,
  className,
}: {
  /** Иконка и подпись приходят готовыми — каталог живёт на сервере. */
  achievements: { key: string; tier: string; icon: string; title: string }[];
  className?: string;
}) {
  const t = useTranslations('achievements');

  if (achievements.length === 0) return null;

  return (
    <ul className={cn('flex items-center gap-1.5', className)}>
      {achievements.map((achievement) => {
        const Icon = achievementIcon(achievement.icon);
        const label = `${achievement.title} · ${t(`tiers.${achievement.tier}`)}`;

        return (
          <li key={achievement.key}>
            <span
              title={label}
              aria-label={label}
              className={cn(
                'flex size-6 items-center justify-center rounded-full bg-surface-2',
                TIER_CLASS[achievement.tier as keyof typeof TIER_CLASS],
              )}
            >
              <Icon aria-hidden className="size-3.5" />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

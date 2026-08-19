'use client';

import { HelpCircle, Pin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { ACHIEVEMENT_TIERS } from '@polyforge/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { achievementIcon } from '@/components/achievements/achievement-icon';
import { toggleFeaturedAchievement } from '@/server/actions/achievements';
import { cn, formatDate } from '@/lib/utils';

/**
 * Полка достижений (§4.8).
 *
 * Скрытые до получения показываются слотом «???» с одной подсказкой —
 * что они существуют. Полностью прятать их нельзя: тогда неоткуда узнать,
 * что в игре есть скрытая часть.
 */

export interface ShelfEntry {
  key: string;
  /** Подписи приходят готовыми: у своих достижений их нет в словаре. */
  title: string;
  description: string;
  icon: string;
  isHidden: boolean;
  thresholds: Record<string, number>;
  value: number;
  rarity: number;
  owned: { tier: string; featured: boolean; grantedAt: string } | null;
}

const TIER_TONE = { bronze: 'warning', silver: 'neutral', gold: 'accent' } as const;

export function AchievementShelf({
  entries,
  locale,
}: {
  entries: ShelfEntry[];
  locale: string;
}) {
  const t = useTranslations('achievements');
  const tRoot = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleFeatured(key: string) {
    startTransition(async () => {
      const result = await toggleFeaturedAchievement(key);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {entries.map((entry) => {
        const locked = !entry.owned;
        const secret = entry.isHidden && locked;

        // Иконка приходит именем из каталога: React-компонент в общий пакет
        // не положить, он должен оставаться независимым от рантайма.
        const Icon = achievementIcon(entry.icon);

        const nextTier = ACHIEVEMENT_TIERS.find(
          (tier) => entry.value < (entry.thresholds[tier] ?? 0),
        );
        const target = nextTier ? entry.thresholds[nextTier] ?? 0 : 0;
        const percent = target === 0 ? 100 : Math.min(100, Math.round((entry.value / target) * 100));

        return (
          <li key={entry.key}>
            <Card className={cn(locked && 'opacity-70')}>
              <CardContent className="flex gap-3 p-4">
                <span
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-full',
                    locked ? 'bg-surface-2 text-fg-muted' : 'bg-accent-soft text-accent',
                  )}
                >
                  {secret ? <HelpCircle aria-hidden /> : <Icon aria-hidden />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {secret ? t('secret') : entry.title}
                    </span>
                    {entry.owned ? (
                      <Badge variant={TIER_TONE[entry.owned.tier as keyof typeof TIER_TONE]}>
                        {t(`tiers.${entry.owned.tier}`)}
                      </Badge>
                    ) : null}
                  </div>

                  <p className="mt-0.5 text-sm text-fg-muted">
                    {secret ? t('secretHint') : entry.description}
                  </p>

                  {!secret ? (
                    <>
                      <div className="mt-2 flex items-center gap-2">
                        <div
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                          role="progressbar"
                          aria-valuenow={percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs whitespace-nowrap text-fg-muted">
                          {nextTier ? `${entry.value} / ${target}` : t('maxed')}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs text-fg-muted">
                        {t('rarity', { percent: entry.rarity })}
                        {entry.owned
                          ? ` · ${formatDate(entry.owned.grantedAt, locale)}`
                          : ''}
                      </p>
                    </>
                  ) : null}

                  {entry.owned ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleFeatured(entry.key)}
                      className={cn(
                        'mt-2 inline-flex items-center gap-1.5 text-xs transition-colors',
                        entry.owned.featured ? 'text-accent' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      <Pin aria-hidden className="size-3.5" />
                      {entry.owned.featured ? t('unfeature') : t('feature')}
                    </button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

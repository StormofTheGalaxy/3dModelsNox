'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Confetti } from '@/components/achievements/confetti';
import { markAchievementsSeen } from '@/server/actions/achievements';

/**
 * Тост «Достижение получено!» (§4.8).
 *
 * Показывается один раз на достижение: список непоказанных приходит с
 * сервера, а после показа помечается прочитанным — иначе конфетти летело бы
 * на каждой навигации.
 */
export function AchievementToast({
  granted,
}: {
  granted: { key: string; tier: string }[];
}) {
  const t = useTranslations('achievements');
  // Тосты — побочный эффект, но одноразовый: повторный рендер не должен
  // выпускать конфетти второй раз.
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || granted.length === 0) return;
    shown.current = true;

    for (const achievement of granted) {
      toast.custom(
        () => (
          <div className="relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border border-accent/40 bg-surface px-4 py-3 shadow-[var(--shadow-glow)]">
            <Confetti />
            <div className="relative">
              <p className="text-sm font-bold">{t('unlocked')}</p>
              <p className="text-sm">
                {t(`items.${achievement.key}.title`)} · {t(`tiers.${achievement.tier}`)}
              </p>
            </div>
          </div>
        ),
        { duration: 5000 },
      );
    }

    void markAchievementsSeen();
  }, [granted, t]);

  return null;
}

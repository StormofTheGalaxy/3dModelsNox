'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Обратный отсчёт до конца торгов.
 *
 * До монтирования показывается серверная строка с датой: тикающий счётчик
 * нельзя отрендерить на сервере, не рассинхронив гидратацию, а «через сколько»
 * у зрителя в другом часовом поясе всё равно своё.
 */
export function AuctionCountdown({
  endsAt,
  fallback,
  className,
}: {
  endsAt: string;
  /** Что показывать до монтирования и в SSR — обычно отформатированная дата. */
  fallback: string;
  className?: string;
}) {
  const t = useTranslations('orders.auction');
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(endsAt).getTime();

    const tick = () => setLeft(target - Date.now());
    tick();

    // Секундная точность нужна только на последнем часе; раньше это лишние
    // перерисовки на странице, которую держат открытой часами.
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (left === null) return <span className={className}>{fallback}</span>;
  if (left <= 0) return <span className={className}>{t('ended')}</span>;

  const totalSeconds = Math.floor(left / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const urgent = left < 60 * 60 * 1000;

  return (
    <span
      className={cn('font-mono tabular-nums', urgent && 'text-danger', className)}
      // Часы обновляются молча: диктовать скринридеру каждую секунду нельзя.
      aria-live="off"
    >
      {days > 0
        ? t('leftDays', { days, hours })
        : hours > 0
          ? t('leftHours', { hours, minutes })
          : t('leftMinutes', { minutes, seconds })}
    </span>
  );
}

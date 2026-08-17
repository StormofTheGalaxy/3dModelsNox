'use client';

import { CheckCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { markNotificationsRead } from '@/server/actions/notifications';
import { cn } from '@/lib/utils';

export interface NotificationItem {
  id: string;
  type: string;
  payload: Record<string, string | number | boolean>;
  readAt: string | null;
  createdAt: string;
}

/**
 * Лента уведомлений (§4.7). Текст собирается из ключей словаря по типу —
 * так же, как в письме, чтобы формулировки не расходились между каналами.
 */
export function NotificationList({
  items,
  unread,
  locale,
}: {
  items: NotificationItem[];
  unread: number;
  locale: string;
}) {
  const t = useTranslations('notifications');
  const [readAll, setReadAll] = useState(unread === 0);
  const [pending, startTransition] = useTransition();

  function markAll() {
    setReadAll(true);
    startTransition(() => {
      void markNotificationsRead();
    });
  }

  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--pf-border)] px-5 py-3">
        <span className="text-sm text-fg-muted">{t('unread', { count: readAll ? 0 : unread })}</span>

        {!readAll && unread > 0 ? (
          <Button size="sm" variant="ghost" loading={pending} onClick={markAll}>
            <CheckCheck aria-hidden />
            {t('markAllRead')}
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col divide-y divide-[var(--pf-border)]">
        {items.map((item) => {
          const link = typeof item.payload.link === 'string' ? item.payload.link : '/notifications';
          const values = Object.fromEntries(
            Object.entries(item.payload).map(([key, value]) => [key, String(value)]),
          );

          return (
            <li
              key={item.id}
              className={cn(
                'flex flex-col gap-1 px-5 py-4 transition-colors',
                !item.readAt && !readAll && 'bg-accent-soft/40',
              )}
            >
              <Link href={link} className="text-sm font-medium hover:text-accent">
                {t(`${item.type}.title`, values)}
              </Link>

              <p className="text-sm text-fg-muted">{t(`${item.type}.body`, values)}</p>

              <span className="text-xs text-fg-muted">
                {formatter.format(new Date(item.createdAt))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

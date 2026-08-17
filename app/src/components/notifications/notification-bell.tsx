'use client';

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Колокольчик в шапке (§4.7). Счётчик приходит с сервера при рендере;
 * живое обновление через ws подключается вместе с чатом в фазе 4.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const t = useTranslations('notifications');

  return (
    <Link
      href="/notifications"
      aria-label={t('title')}
      className={cn(
        'relative flex size-9 items-center justify-center rounded-[var(--radius-control)]',
        'text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Bell className="size-4" aria-hidden />

      {unread > 0 ? (
        <span
          className={cn(
            'absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full',
            'bg-[var(--pf-danger)] px-1 text-[10px] font-bold text-white',
          )}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

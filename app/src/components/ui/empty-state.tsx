import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Пустое состояние (§5.4): всегда с иллюстрацией и призывом к действию,
 * а не с сухим «нет данных».
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)]',
        'border border-dashed border-[var(--pf-border)] px-6 py-14 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-2xl',
          'bg-accent-soft text-accent',
        )}
      >
        <Icon className="size-6" aria-hidden />
      </div>

      <p className="text-base font-semibold">{title}</p>

      {description ? (
        <p className="max-w-sm text-sm text-fg-muted">{description}</p>
      ) : null}

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

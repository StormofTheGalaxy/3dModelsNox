import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Нативный `<select>`: на мобильных он открывает системный список, с которым
 * ни один кастомный дропдаун не сравнится по удобству.
 */
export function Select({
  className,
  invalid,
  children,
  ...props
}: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          'h-11 w-full appearance-none rounded-[var(--radius-control)] border bg-surface-2',
          'pl-3.5 pr-10 text-sm text-fg transition-colors duration-150',
          'focus:border-accent focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid
            ? 'border-[var(--pf-danger)] focus:border-[var(--pf-danger)]'
            : 'border-[var(--pf-border)]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
        aria-hidden
      />
    </div>
  );
}

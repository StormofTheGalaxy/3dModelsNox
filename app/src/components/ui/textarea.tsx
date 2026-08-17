import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Textarea({
  className,
  invalid,
  ...props
}: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-28 w-full rounded-[var(--radius-control)] border bg-surface-2 px-3.5 py-3 text-sm text-fg',
        'placeholder:text-fg-muted/70 transition-colors duration-150 resize-y',
        'focus:border-accent focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid
          ? 'border-[var(--pf-danger)] focus:border-[var(--pf-danger)]'
          : 'border-[var(--pf-border)]',
        className,
      )}
      {...props}
    />
  );
}

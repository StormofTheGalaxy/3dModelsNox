import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** Скелетон загрузки с бегущим бликом (§5.3). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-[var(--radius-control)] bg-surface-2',
        'bg-[linear-gradient(90deg,var(--pf-surface-2)_25%,var(--pf-border)_50%,var(--pf-surface-2)_75%)]',
        'bg-[length:200%_100%] [animation:pf-shimmer_1.4s_linear_infinite]',
        className,
      )}
      {...props}
    />
  );
}

import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Поверхность-карточка. `glow` включает подсветку акцентом при наведении —
 * приём для карточек работ и заказов (§5.2).
 */
export function Card({
  className,
  glow = false,
  ...props
}: ComponentProps<'div'> & { glow?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--pf-border)] bg-surface',
        'transition-all duration-200 ease-[var(--ease-out-quick)]',
        glow && 'hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow-glow)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-6 pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-lg leading-tight font-bold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-fg-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-3 p-6 pt-0', className)} {...props} />;
}

import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        accent: 'bg-accent-soft text-accent',
        neutral: 'bg-surface-2 text-fg-muted',
        success: 'bg-[color-mix(in_oklab,var(--pf-success)_16%,transparent)] text-[var(--pf-success)]',
        warning: 'bg-[color-mix(in_oklab,var(--pf-warning)_16%,transparent)] text-[var(--pf-warning)]',
        danger: 'bg-[color-mix(in_oklab,var(--pf-danger)_16%,transparent)] text-[var(--pf-danger)]',
        outline: 'border border-[var(--pf-border)] text-fg-muted',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

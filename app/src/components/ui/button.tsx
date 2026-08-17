import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium',
    'whitespace-nowrap transition-all duration-150 ease-[var(--ease-out-quick)]',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        // Основной CTA — градиент акцента (§5.2).
        primary:
          'pf-gradient text-white shadow-[var(--shadow-soft)] hover:brightness-110 active:brightness-95',
        secondary:
          'bg-surface-2 text-fg border border-[var(--pf-border)] hover:border-accent/60 hover:bg-surface',
        outline:
          'border border-[var(--pf-border)] bg-transparent text-fg hover:border-accent/60 hover:bg-accent-soft',
        ghost: 'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
        danger: 'bg-[var(--pf-danger)] text-white hover:brightness-110',
        link: 'bg-transparent text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-sm [&_svg]:size-4',
        md: 'h-11 px-5 text-sm [&_svg]:size-4',
        lg: 'h-12 px-7 text-base [&_svg]:size-5',
        icon: 'size-10 [&_svg]:size-4',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  },
);

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Рендерит стили кнопки на дочернем элементе (например, на ссылке). */
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block }), className);

  // Slot требует ровно одного потомка: даже `null` рядом с ним ломает рендер,
  // поэтому в режиме asChild отдаём детей как есть, без спиннера.
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={classes}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };

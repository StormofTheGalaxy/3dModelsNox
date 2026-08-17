'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm font-medium text-fg', className)}
      {...props}
    />
  );
}

export function Input({
  className,
  invalid,
  ...props
}: ComponentProps<'input'> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-11 w-full rounded-[var(--radius-control)] border bg-surface-2 px-3.5 text-sm text-fg',
        'placeholder:text-fg-muted/70',
        'transition-colors duration-150',
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

export interface FieldProps {
  label: string;
  /** Ошибка уже переведена вызывающей стороной. */
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: (props: { id: string; invalid: boolean; describedBy: string | undefined }) => ReactNode;
}

/**
 * Обёртка поля формы: подпись, подсказка, ошибка и связка через aria-describedby.
 * Компонент не знает про i18n — тексты приходят готовыми.
 */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-[var(--pf-danger)]">*</span> : null}
      </Label>

      {children({ id, invalid: Boolean(error), describedBy })}

      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-[var(--pf-danger)]">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

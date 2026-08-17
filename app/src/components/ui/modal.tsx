'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Модалка на Radix Dialog: фокус-ловушка, Esc и aria — из коробки.
 * Анимация fade+slide 150–200 мс согласно §5.3.
 */

export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;

export function ModalContent({
  className,
  children,
  title,
  description,
  closeLabel = 'Close',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: ReactNode;
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
          'data-[state=open]:[animation:pf-fade-in_150ms_var(--ease-out-quick)]',
          'data-[state=closed]:[animation:pf-fade-out_120ms_var(--ease-out-quick)]',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
          'rounded-[var(--radius-card)] border border-[var(--pf-border)] bg-surface p-6',
          'shadow-[var(--shadow-soft)]',
          'data-[state=open]:[animation:pf-modal-in_180ms_var(--ease-out-quick)]',
          'data-[state=closed]:[animation:pf-modal-out_140ms_var(--ease-out-quick)]',
          className,
        )}
        {...props}
      >
        <div className="mb-4 flex flex-col gap-1.5 pr-8">
          <DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-fg-muted">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>

        {children}

        <DialogPrimitive.Close
          className={cn(
            'absolute right-4 top-4 rounded-lg p-1.5 text-fg-muted',
            'transition-colors hover:bg-surface-2 hover:text-fg',
          )}
          aria-label={closeLabel}
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

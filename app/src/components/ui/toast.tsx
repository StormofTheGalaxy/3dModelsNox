'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * Тосты. Стили привязаны к токенам темы, поэтому переключение темы
 * не требует пересборки провайдера.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      toastOptions={{
        style: {
          background: 'var(--pf-surface)',
          border: '1px solid var(--pf-border)',
          color: 'var(--pf-text)',
          borderRadius: 'var(--radius-control)',
        },
      }}
    />
  );
}

export { toast };

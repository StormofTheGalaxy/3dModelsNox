'use client';

import { useTranslations } from 'next-intl';

import type { ActionState } from '@/server/actions/types';
import { Alert } from '@/components/ui/alert';

/**
 * Показывает общий результат действия. Сервер возвращает ключ словаря,
 * перевод происходит здесь — на языке, который читает пользователь (§9 DoD).
 */
export function FormMessage({ state }: { state: ActionState }) {
  const t = useTranslations();

  if (state.status === 'idle' || !state.message) return null;

  return (
    <Alert tone={state.status === 'error' ? 'danger' : 'success'}>
      {t(state.message, state.values)}
    </Alert>
  );
}

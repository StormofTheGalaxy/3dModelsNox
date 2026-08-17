'use client';

import { useEffect } from 'react';

import { useRouter } from '@/i18n/navigation';
import type { ActionState } from '@/server/actions/types';

/**
 * Server action не делает redirect сам: он возвращает путь, а переход
 * выполняет клиент. Так форма успевает показать сообщение об успехе,
 * а состояние `useActionState` не теряется на исключении redirect().
 */
export function useActionRedirect(state: ActionState): void {
  const router = useRouter();

  useEffect(() => {
    if (state.status !== 'success' || !state.redirectTo) return;

    router.push(state.redirectTo);
    // Шапка зависит от сессии — без refresh она осталась бы гостевой.
    router.refresh();
  }, [state, router]);
}

import 'server-only';

import { redirect } from 'next/navigation';

/**
 * Уход на страницу входа со страницы, требующей авторизации.
 *
 * Не `redirect('/login')`: если кука сессии осталась, а сама сессия отозвана,
 * proxy уведёт со страницы входа обратно в кабинет — и получится петля.
 * Маршрут `/api/auth/session-ended` сначала удаляет куку.
 */
export function redirectToLogin(locale: string, next?: string): never {
  const params = new URLSearchParams({ locale });
  if (next) params.set('next', next);

  redirect(`/api/auth/session-ended?${params.toString()}`);
}

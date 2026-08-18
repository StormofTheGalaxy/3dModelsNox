import 'server-only';

import { redirect } from 'next/navigation';

import { redirectToLogin } from './redirects';
import { getCurrentUser, isStaff, type SessionUser } from './session';

/**
 * Серверные гварды. Проверка прав обязана происходить здесь, а не только
 * в middleware и не только в разметке (§9 DoD).
 */

export async function requireUser(locale: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    // Не `/login` напрямую: кука сессии может пережить саму сессию (бан,
    // разлогин со всех устройств), и тогда proxy вернёт со страницы входа
    // обратно в кабинет. Роут сначала удаляет куку.
    redirectToLogin(locale);
  }
  return user;
}

/**
 * Подтверждённый email обязателен до любых действий на платформе (§4.1),
 * поэтому все продуктовые страницы идут через этот гвард, а не через requireUser.
 */
export async function requireVerifiedUser(locale: string): Promise<SessionUser> {
  const user = await requireUser(locale);
  if (!user.emailVerifiedAt) {
    redirect(`/${locale}/verify-email`);
  }
  return user;
}

export async function requireStaff(locale: string): Promise<SessionUser> {
  const user = await requireVerifiedUser(locale);
  if (!isStaff(user)) {
    redirect(`/${locale}`);
  }
  return user;
}

/**
 * Обратный гвард: вошедшего пользователя уводим со страниц входа и
 * регистрации в кабинет.
 *
 * Живёт на странице, а не в proxy: proxy работает на Edge и видит только
 * наличие куки. Кука переживает саму сессию (бан отзывает сессии, разлогин
 * со всех устройств — тоже), и увод по одному её наличию зацикливается с
 * редиректом страницы на /login. Здесь же сессия проверяется по-настоящему.
 */
export async function redirectIfAuthenticated(locale: string): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    redirect(`/${locale}/dashboard`);
  }
}

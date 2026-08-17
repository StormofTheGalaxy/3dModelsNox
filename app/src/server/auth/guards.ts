import 'server-only';

import { redirect } from 'next/navigation';

import { getCurrentUser, isStaff, type SessionUser } from './session';

/**
 * Серверные гварды. Проверка прав обязана происходить здесь, а не только
 * в middleware и не только в разметке (§9 DoD).
 */

export async function requireUser(locale: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login`);
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

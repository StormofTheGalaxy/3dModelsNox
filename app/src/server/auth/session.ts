import 'server-only';

import { cache } from 'react';
import { cookies, headers } from 'next/headers';

import { prisma, type User } from '@polyforge/db';
import { COOKIES, REFRESH_TOKEN_TTL_SECONDS } from '@polyforge/shared';

import { isProduction } from '../env';
import { generateToken, hashToken } from './tokens';

/**
 * Сессия — серверная: в куке лежит непрозрачный случайный токен, в БД —
 * его HMAC-хэш. Так админ может мгновенно разлогинить пользователя (бан),
 * чего самодостаточный JWT не позволяет.
 */

export type SessionUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'nickname'
  | 'role'
  | 'status'
  | 'locale'
  | 'theme'
  | 'lastRoleContext'
  | 'emailVerifiedAt'
  | 'invitesLeft'
  | 'banUntil'
>;

const SESSION_USER_SELECT = {
  id: true,
  email: true,
  nickname: true,
  role: true,
  status: true,
  locale: true,
  theme: true,
  lastRoleContext: true,
  emailVerifiedAt: true,
  invitesLeft: true,
  banUntil: true,
} as const;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Создаёт сессию и ставит куку. Вызывать только из server action / route handler. */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const headerList = await headers();

  await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      userAgent: headerList.get('user-agent')?.slice(0, 512) ?? null,
      ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIES.refreshToken, token, cookieOptions(REFRESH_TOKEN_TTL_SECONDS));
}

/** Завершает текущую сессию: помечает запись отозванной и стирает куку. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIES.refreshToken)?.value;

  if (token) {
    await prisma.refreshSession.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cookieStore.delete(COOKIES.refreshToken);
}

/** Отзывает все сессии пользователя — при смене пароля и бане. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Текущий пользователь или null. `cache` из React делает вызов идемпотентным
 * в пределах одного рендера: layout и страница не бьют в БД дважды.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIES.refreshToken)?.value;
  if (!token) return null;

  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: SESSION_USER_SELECT },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  const user = session.user;

  if (user.status === 'deleted' || user.status === 'banned') {
    return null;
  }

  // Временный бан истёк — возвращаем пользователя в строй.
  if (user.status === 'temp_banned') {
    if (user.banUntil && user.banUntil > new Date()) {
      return null;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'active', banUntil: null },
    });
    user.status = 'active';
  }

  // «Онлайн» с точностью до пяти минут — чтобы не писать в БД на каждый запрос.
  const staleAfter = Date.now() - 5 * 60 * 1000;
  if (session.lastUsedAt.getTime() < staleAfter) {
    void prisma.refreshSession
      .update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
    void prisma.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return user;
});

/** Пользователь с подтверждённым email; иначе — null. */
export async function getVerifiedUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || !user.emailVerifiedAt) return null;
  return user;
}

export function isStaff(user: SessionUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'moderator' || user?.role === 'arbiter';
}

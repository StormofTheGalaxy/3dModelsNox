import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@polyforge/db';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@polyforge/shared';

import { writeAuditLog } from '@/server/audit';
import {
  OAUTH_STATE_COOKIE,
  exchangeDiscordCode,
  fetchDiscordProfile,
  uniqueNicknameFrom,
} from '@/server/auth/oauth';
import { createSession, getCurrentUser } from '@/server/auth/session';
import { absoluteUrl } from '@/server/env';
import { issueDefaultInvites } from '@/server/invites';
import { getSetting } from '@/server/settings';

export const dynamic = 'force-dynamic';

function failure(locale: Locale, reason: string): NextResponse {
  return NextResponse.redirect(absoluteUrl(`/${locale}/login?error=${reason}`));
}

/**
 * Возврат из Discord. Три сценария:
 *   1. Discord уже привязан → вход.
 *   2. Есть аккаунт с таким email → привязываем Discord к нему.
 *   3. Нового аккаунта нет → создаём, если закрытая бета этого не запрещает.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? '';
  const [expectedState, cookieLocale] = stateCookie.split(':');
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code || !state || !expectedState || state !== expectedState) {
    return failure(locale, 'oauth_state');
  }

  const accessToken = await exchangeDiscordCode(code);
  if (!accessToken) return failure(locale, 'oauth_exchange');

  const profile = await fetchDiscordProfile(accessToken);
  if (!profile) return failure(locale, 'oauth_profile');

  const existingLink = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'discord', providerAccountId: profile.id } },
    select: { userId: true },
  });

  let userId = existingLink?.userId ?? null;

  // Пользователь уже вошёл и привязывает Discord к текущему аккаунту.
  if (!userId) {
    const current = await getCurrentUser();
    if (current) {
      await prisma.oAuthAccount.create({
        data: {
          provider: 'discord',
          providerAccountId: profile.id,
          userId: current.id,
          username: profile.username,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        },
      });
      userId = current.id;
    }
  }

  // Есть аккаунт с тем же подтверждённым email — связываем, а не плодим дубль.
  if (!userId && profile.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: profile.email.toLowerCase() },
      select: { id: true },
    });

    if (byEmail) {
      await prisma.oAuthAccount.create({
        data: {
          provider: 'discord',
          providerAccountId: profile.id,
          userId: byEmail.id,
          username: profile.username,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        },
      });
      userId = byEmail.id;
    }
  }

  // Новый пользователь. В закрытой бете аккаунт создать нельзя без инвайта,
  // поэтому отправляем на регистрацию, где код обязателен.
  if (!userId) {
    const inviteOnly = await getSetting('registration_invite_only');
    if (inviteOnly) {
      return NextResponse.redirect(absoluteUrl(`/${locale}/register?error=invite_required`));
    }
    if (!profile.email) {
      return failure(locale, 'oauth_no_email');
    }

    const nickname = await uniqueNicknameFrom(profile.username, async (candidate) => {
      const found = await prisma.user.findUnique({
        where: { nicknameLower: candidate.toLowerCase() },
        select: { id: true },
      });
      return Boolean(found);
    });

    const created = await prisma.user.create({
      data: {
        email: profile.email.toLowerCase(),
        nickname,
        nicknameLower: nickname.toLowerCase(),
        locale,
        // Discord уже подтвердил адрес — второй раз просить незачем.
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        oauthAccounts: {
          create: {
            provider: 'discord',
            providerAccountId: profile.id,
            username: profile.username,
            email: profile.email,
            avatarUrl: profile.avatarUrl,
          },
        },
      },
      select: { id: true },
    });

    await issueDefaultInvites(created.id);
    await writeAuditLog({
      action: 'user.registered',
      actorId: created.id,
      targetType: 'user',
      targetId: created.id,
      payload: { provider: 'discord' },
    });

    userId = created.id;
  }

  await createSession(userId);
  await writeAuditLog({ action: 'user.login', actorId: userId, targetType: 'user', targetId: userId });

  const response = NextResponse.redirect(absoluteUrl(`/${locale}/dashboard`));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

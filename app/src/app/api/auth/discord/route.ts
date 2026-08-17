import { randomBytes } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { DEFAULT_LOCALE, isLocale } from '@polyforge/shared';

import { OAUTH_STATE_COOKIE, discordAuthorizeUrl } from '@/server/auth/oauth';
import { env, isProduction } from '@/server/env';

export const dynamic = 'force-dynamic';

/**
 * Старт Discord OAuth (§4.1). `state` кладём в httpOnly-куку и сверяем в
 * callback — иначе чужой запрос мог бы привязать свой Discord к сессии.
 */
export function GET(request: NextRequest): NextResponse {
  if (!env.DISCORD_CLIENT_ID) {
    return NextResponse.json({ error: 'discord_not_configured' }, { status: 501 });
  }

  const requestedLocale = request.nextUrl.searchParams.get('locale');
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;

  const state = randomBytes(16).toString('base64url');
  const response = NextResponse.redirect(discordAuthorizeUrl(state));

  response.cookies.set(OAUTH_STATE_COOKIE, `${state}:${locale}`, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}

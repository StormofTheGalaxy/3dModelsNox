import 'server-only';

import { absoluteUrl, env } from '../env';

/**
 * Discord OAuth (§4.1). Вынесено из route handler: файлы роутов могут
 * экспортировать только обработчики методов.
 */

export const OAUTH_STATE_COOKIE = 'pf_oauth_state';

export interface DiscordProfile {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
}

export function discordAuthorizeUrl(state: string): URL {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', absoluteUrl('/api/auth/discord/callback'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify email');
  url.searchParams.set('state', state);
  return url;
}

export async function exchangeDiscordCode(code: string): Promise<string | null> {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: absoluteUrl('/api/auth/discord/callback'),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function fetchDiscordProfile(accessToken: string): Promise<DiscordProfile | null> {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    id?: string;
    username?: string;
    email?: string | null;
    verified?: boolean;
    avatar?: string | null;
  };

  if (!data.id || !data.username) return null;

  return {
    id: data.id,
    username: data.username,
    email: data.email ?? null,
    emailVerified: data.verified === true,
    avatarUrl: data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
      : null,
  };
}

/**
 * Ник из Discord может конфликтовать с занятым: подбираем свободный вариант.
 * Проверку уникальности делает вызывающая сторона через `isTaken`.
 */
export async function uniqueNicknameFrom(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const sanitized = base.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 28) || 'user';

  if (!(await isTaken(sanitized))) return sanitized;

  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = `${sanitized}_${attempt}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  return `${sanitized}_${Date.now().toString(36)}`;
}

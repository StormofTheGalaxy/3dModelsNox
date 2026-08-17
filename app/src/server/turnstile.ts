import 'server-only';

import { env } from './env';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Проверка капчи Cloudflare Turnstile (§2.1).
 * Без настроенного секрета проверка пропускается — это режим локальной разработки.
 */
export async function verifyTurnstile(token: string, ip?: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    return true;
  }
  if (!token) return false;

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.set('remoteip', ip);

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      // Капча не должна вешать форму: 5 секунд и хватит.
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

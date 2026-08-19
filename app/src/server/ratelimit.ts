import 'server-only';

import { getSetting } from './settings';
import { redis } from './redis';

/**
 * Скользящее окно на Redis (§2.4). Пороги живут в настройке `rate_limits`,
 * а не в коде, поэтому админ меняет их без деплоя.
 */

export type RateLimitAction =
  | 'login'
  | 'register'
  | 'password_reset'
  | 'ai'
  | 'upload'
  | 'response'
  | 'bid'
  | 'telegram_link'
  | 'comment'
  | 'organization'
  | 'push_subscribe'
  | 'message';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Сколько секунд ждать до следующей попытки. */
  retryAfterSeconds: number;
}

const FALLBACK = { points: 20, windowSeconds: 60 };

export async function checkRateLimit(
  action: RateLimitAction,
  identifier: string,
): Promise<RateLimitResult> {
  const limits = await getSetting('rate_limits');
  const rule = limits[action] ?? FALLBACK;

  const key = `rl:${action}:${identifier}`;

  try {
    const results = await redis.multi().incr(key).ttl(key).exec();

    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[1]?.[1] ?? -1);

    if (ttl < 0) {
      await redis.expire(key, rule.windowSeconds);
    }

    const remaining = Math.max(0, rule.points - count);
    return {
      allowed: count <= rule.points,
      remaining,
      retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  } catch {
    // Redis недоступен: не блокируем пользователей из-за инфраструктуры.
    return { allowed: true, remaining: rule.points, retryAfterSeconds: 0 };
  }
}

/** Сброс счётчика — например, после успешного входа. */
export async function resetRateLimit(action: RateLimitAction, identifier: string): Promise<void> {
  try {
    await redis.del(`rl:${action}:${identifier}`);
  } catch {
    // не критично
  }
}

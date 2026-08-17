import 'server-only';

import Redis from 'ioredis';

import { env } from './env';

/**
 * Один клиент Redis на процесс.
 *
 * Подключение создаётся при первом обращении, а не при импорте модуля:
 * `next build` импортирует серверные модули для сбора данных страниц, и
 * открытый сокет там только мешает. В dev клиент кэшируется в globalThis —
 * иначе hot reload плодил бы соединения до отказа Redis.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis };

function createRedis(): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: true,
  });

  client.on('error', (error: Error) => {
    // Redis нужен для кэша и лимитов: приложение переживает его падение,
    // поэтому логируем, но не роняем процесс.
    console.error('[redis]', error.message);
  });

  return client;
}

function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createRedis();
  }
  return globalForRedis.redis;
}

// Прокси, чтобы вызывающий код писал `redis.get(...)`, не думая о ленивой инициализации.
export const redis: Redis = new Proxy({} as Redis, {
  get(_target, property) {
    const client = getRedis();
    const value = Reflect.get(client, property) as unknown;
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/** Мягкое чтение: при недоступном Redis возвращаем null вместо исключения. */
export async function safeGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function safeSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  try {
    if (ttlSeconds) {
      await redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await redis.set(key, value);
    }
  } catch {
    // кэш не критичен
  }
}

export async function safeDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // кэш не критичен
  }
}

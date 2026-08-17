import 'server-only';

import { prisma } from '@polyforge/db';
import {
  SETTING_KEYS,
  getSettingDefault,
  parseSettingValue,
  type SettingKey,
  type SettingValue,
} from '@polyforge/shared';

import { redis, safeDel } from './redis';

/**
 * Чтение настроек платформы (§1.2.6).
 *
 * Два уровня кэша: Redis (общий для всех инстансов app/ws/worker) и память
 * процесса на короткий срок — настройки читаются почти на каждый запрос.
 * Запись в админке вызывает `invalidateSettingsCache()`.
 */

const REDIS_KEY = 'settings:all';
const REDIS_TTL_SECONDS = 300;
const MEMORY_TTL_MS = 5_000;

type SettingsMap = Record<string, unknown>;

let memoryCache: { value: SettingsMap; expiresAt: number } | null = null;

async function loadFromDatabase(): Promise<SettingsMap> {
  const rows = await prisma.platformSetting.findMany({
    select: { key: true, value: true },
  });

  const map: SettingsMap = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

async function loadSettings(): Promise<SettingsMap> {
  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) {
    return memoryCache.value;
  }

  let map: SettingsMap | null = null;

  try {
    const cached = await redis.get(REDIS_KEY);
    if (cached) map = JSON.parse(cached) as SettingsMap;
  } catch {
    // Redis недоступен — читаем напрямую из БД.
  }

  if (!map) {
    try {
      map = await loadFromDatabase();
      try {
        await redis.set(REDIS_KEY, JSON.stringify(map), 'EX', REDIS_TTL_SECONDS);
      } catch {
        // кэш не критичен
      }
    } catch (error) {
      // База недоступна (или идёт сборка образа без DATABASE_URL): работаем на
      // значениях по умолчанию из реестра и не кэшируем пустой результат.
      console.warn('[settings] БД недоступна, использую значения по умолчанию', error);
      return {};
    }
  }

  memoryCache = { value: map, expiresAt: now + MEMORY_TTL_MS };
  return map;
}

/**
 * Значение настройки. Если в БД записи нет или она не проходит валидацию —
 * возвращается значение по умолчанию из реестра, а не падение.
 */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const map = await loadSettings();
  if (!(key in map)) {
    return getSettingDefault(key) as SettingValue<K>;
  }

  try {
    return parseSettingValue(key, map[key]);
  } catch {
    console.warn(`[settings] значение "${key}" в БД некорректно, использую default`);
    return getSettingDefault(key) as SettingValue<K>;
  }
}

/** Пакетное чтение — один поход в кэш вместо N. */
export async function getSettings<K extends SettingKey>(
  keys: readonly K[],
): Promise<{ [P in K]: SettingValue<P> }> {
  const map = await loadSettings();
  const result = {} as { [P in K]: SettingValue<P> };

  for (const key of keys) {
    try {
      result[key] = key in map ? parseSettingValue(key, map[key]) : getSettingDefault(key);
    } catch {
      result[key] = getSettingDefault(key);
    }
  }

  return result;
}

/** Полный снимок для админки: значение из БД либо default. */
export async function getAllSettings(): Promise<Record<SettingKey, unknown>> {
  const map = await loadSettings();
  const result = {} as Record<SettingKey, unknown>;

  for (const key of SETTING_KEYS) {
    result[key] = key in map ? map[key] : getSettingDefault(key);
  }

  return result;
}

export async function invalidateSettingsCache(): Promise<void> {
  memoryCache = null;
  await safeDel(REDIS_KEY);
}

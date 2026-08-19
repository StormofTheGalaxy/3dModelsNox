import 'server-only';

import { prisma, type AchievementAudience } from '@polyforge/db';
import {
  ACHIEVEMENTS,
  type AchievementThresholds,
} from '@polyforge/shared';

import { redis, safeDel } from './redis';
import { getSetting } from './settings';

/**
 * Каталог достижений (§3, post-MVP №9).
 *
 * Раньше он был константой в коде, и на каждый вызов это ничего не стоило.
 * Теперь это таблица, а читают её полка достижений, профиль, лидерборд и
 * триггеры выдачи — то есть почти каждая страница. Отсюда тот же двойной
 * кэш, что у настроек платформы: Redis на всех и память процесса на
 * секунды.
 */

const REDIS_KEY = 'achievements:catalog';
const REDIS_TTL_SECONDS = 300;
const MEMORY_TTL_MS = 5_000;

export interface CatalogEntry {
  key: string;
  audience: AchievementAudience;
  metric: string;
  thresholds: AchievementThresholds;
  icon: string;
  isHidden: boolean;
  isSystem: boolean;
  isEnabled: boolean;
  /** Подписи собственных достижений; у системных null — они из словаря. */
  title: { ru: string; en: string } | null;
  description: { ru: string; en: string } | null;
  sortOrder: number;
}

let memoryCache: { value: CatalogEntry[]; expiresAt: number } | null = null;

export async function achievementBuilderEnabled(): Promise<boolean> {
  return getSetting('feature_achievement_builder');
}

function toEntry(row: {
  key: string;
  audience: AchievementAudience;
  metric: string;
  bronze: number;
  silver: number;
  gold: number;
  icon: string;
  isHidden: boolean;
  isSystem: boolean;
  isEnabled: boolean;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  sortOrder: number;
}): CatalogEntry {
  return {
    key: row.key,
    audience: row.audience,
    metric: row.metric,
    thresholds: { bronze: row.bronze, silver: row.silver, gold: row.gold },
    icon: row.icon,
    isHidden: row.isHidden,
    isSystem: row.isSystem,
    isEnabled: row.isEnabled,
    title: row.titleRu && row.titleEn ? { ru: row.titleRu, en: row.titleEn } : null,
    description:
      row.descriptionRu && row.descriptionEn
        ? { ru: row.descriptionRu, en: row.descriptionEn }
        : null,
    sortOrder: row.sortOrder,
  };
}

/**
 * Запасной каталог из кода.
 *
 * Нужен ровно на один случай: таблица пуста, потому что сид ещё не
 * прогнали. Пустой каталог означал бы, что достижения на платформе просто
 * исчезли, — а стандартный набор известен и лежит рядом.
 */
function fallbackCatalog(): CatalogEntry[] {
  return ACHIEVEMENTS.map((definition, index) => ({
    key: definition.key,
    audience: definition.audience,
    metric: definition.metric,
    thresholds: definition.thresholds,
    icon: definition.icon,
    isHidden: definition.isHidden ?? false,
    isSystem: true,
    isEnabled: true,
    title: null,
    description: null,
    sortOrder: index,
  }));
}

async function loadFromDatabase(): Promise<CatalogEntry[]> {
  const rows = await prisma.achievement.findMany({
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    select: {
      key: true,
      audience: true,
      metric: true,
      bronze: true,
      silver: true,
      gold: true,
      icon: true,
      isHidden: true,
      isSystem: true,
      isEnabled: true,
      titleRu: true,
      titleEn: true,
      descriptionRu: true,
      descriptionEn: true,
      sortOrder: true,
    },
  });

  return rows.map(toEntry);
}

/** Весь каталог, включая выключенные — для админки. */
export async function achievementCatalog(): Promise<CatalogEntry[]> {
  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) return memoryCache.value;

  let catalog: CatalogEntry[] | null = null;

  try {
    const cached = await redis.get(REDIS_KEY);
    if (cached) catalog = JSON.parse(cached) as CatalogEntry[];
  } catch {
    // Redis недоступен — читаем напрямую из БД.
  }

  if (!catalog) {
    try {
      catalog = await loadFromDatabase();
      try {
        await redis.set(REDIS_KEY, JSON.stringify(catalog), 'EX', REDIS_TTL_SECONDS);
      } catch {
        // кэш не критичен
      }
    } catch (error) {
      console.warn('[achievements] БД недоступна, использую набор из кода', error);
      return fallbackCatalog();
    }
  }

  if (catalog.length === 0) return fallbackCatalog();

  memoryCache = { value: catalog, expiresAt: now + MEMORY_TTL_MS };
  return catalog;
}

/** Только действующие достижения — для выдачи, полки и профиля. */
export async function activeAchievements(): Promise<CatalogEntry[]> {
  return (await achievementCatalog()).filter((entry) => entry.isEnabled);
}

export async function achievementByKeyFromCatalog(key: string): Promise<CatalogEntry | undefined> {
  return (await achievementCatalog()).find((entry) => entry.key === key);
}

export async function invalidateAchievementCache(): Promise<void> {
  memoryCache = null;
  await safeDel(REDIS_KEY);
}

/**
 * Редкость достижения: у скольких процентов оно есть.
 *
 * Считается от числа подтверждённых аккаунтов, а не от всех записей:
 * незавершённые регистрации размывают долю и делают любое достижение
 * «редким».
 */
export async function achievementRarity(): Promise<Map<string, { holders: number; percent: number }>> {
  const [grouped, total] = await Promise.all([
    prisma.userAchievement.groupBy({
      by: ['key'],
      _count: { key: true },
    }),
    prisma.user.count({ where: { emailVerifiedAt: { not: null }, status: 'active' } }),
  ]);

  const rarity = new Map<string, { holders: number; percent: number }>();

  for (const row of grouped) {
    const holders = row._count.key;
    rarity.set(row.key, {
      holders,
      percent: total > 0 ? Math.round((holders / total) * 1000) / 10 : 0,
    });
  }

  return rarity;
}

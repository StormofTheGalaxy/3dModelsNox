/**
 * Каталог достижений (§3, §4.8).
 *
 * Конфиг живёт в коде, а не в БД: условия выдачи — это код, и держать их
 * половину в таблице значило бы иметь два источника правды. В БД лежат
 * только факты выдачи (`UserAchievement`), а админка управляет видимостью
 * и смотрит статистику редкости.
 *
 * Подписи — ключи словаря (`achievements.<key>.title` / `.description`),
 * поэтому каталог одинаково читается на обоих языках.
 */

export const ACHIEVEMENT_TIERS = ['bronze', 'silver', 'gold'] as const;
export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number];

/** Что считает триггер. Значения собирает воркер одним проходом по метрикам. */
export const ACHIEVEMENT_METRICS = [
  'dealsCompleted',
  'worksPublished',
  'reviewsFiveStar',
  'onTimeStreak',
  'ordersPublished',
  'responsesSent',
  'repeatClients',
  'briefsCreated',
  'disputesWon',
  'nightDeliveries',
  'currencies',
  'revisionFreeDeals',
] as const;
export type AchievementMetric = (typeof ACHIEVEMENT_METRICS)[number];

export interface AchievementDefinition {
  key: string;
  /** Кому показывать в списке: дизайнерская или заказчицкая ветка. */
  audience: 'designer' | 'customer' | 'any';
  metric: AchievementMetric;
  /** Пороги по тирам. Достижение выдаётся на наибольший достигнутый тир. */
  thresholds: Record<AchievementTier, number>;
  /** Скрытые не показываются до получения — на полке вместо них «???». */
  isHidden?: boolean;
  /** Иконка lucide — имя разрешает клиент, чтобы не тащить сюда React. */
  icon: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // ── Дизайнер ──────────────────────────────────────────────────────────────
  {
    key: 'first_deal',
    audience: 'designer',
    metric: 'dealsCompleted',
    thresholds: { bronze: 1, silver: 10, gold: 50 },
    icon: 'Handshake',
  },
  {
    key: 'portfolio_builder',
    audience: 'designer',
    metric: 'worksPublished',
    thresholds: { bronze: 3, silver: 15, gold: 40 },
    icon: 'Images',
  },
  {
    key: 'five_stars',
    audience: 'designer',
    metric: 'reviewsFiveStar',
    thresholds: { bronze: 3, silver: 15, gold: 50 },
    icon: 'Star',
  },
  {
    key: 'always_on_time',
    audience: 'designer',
    metric: 'onTimeStreak',
    thresholds: { bronze: 5, silver: 20, gold: 50 },
    icon: 'Clock',
  },
  {
    key: 'responsive',
    audience: 'designer',
    metric: 'responsesSent',
    thresholds: { bronze: 10, silver: 50, gold: 200 },
    icon: 'Send',
  },
  {
    key: 'trusted',
    audience: 'designer',
    metric: 'repeatClients',
    thresholds: { bronze: 1, silver: 5, gold: 15 },
    icon: 'HeartHandshake',
  },

  // ── Заказчик ──────────────────────────────────────────────────────────────
  {
    key: 'brief_master',
    audience: 'customer',
    metric: 'briefsCreated',
    thresholds: { bronze: 1, silver: 10, gold: 30 },
    icon: 'FileText',
  },
  {
    key: 'order_maker',
    audience: 'customer',
    metric: 'ordersPublished',
    thresholds: { bronze: 1, silver: 10, gold: 40 },
    icon: 'ClipboardList',
  },

  // ── Скрытые (§3: около пяти штук) ─────────────────────────────────────────
  {
    key: 'night_shift',
    audience: 'designer',
    metric: 'nightDeliveries',
    thresholds: { bronze: 3, silver: 10, gold: 25 },
    isHidden: true,
    icon: 'Moon',
  },
  {
    key: 'polyglot_wallet',
    audience: 'any',
    metric: 'currencies',
    thresholds: { bronze: 2, silver: 3, gold: 4 },
    isHidden: true,
    icon: 'Coins',
  },
  {
    key: 'first_try',
    audience: 'designer',
    metric: 'revisionFreeDeals',
    thresholds: { bronze: 1, silver: 5, gold: 20 },
    isHidden: true,
    icon: 'Target',
  },
  {
    key: 'vindicated',
    audience: 'any',
    metric: 'disputesWon',
    thresholds: { bronze: 1, silver: 3, gold: 10 },
    isHidden: true,
    icon: 'Scale',
  },
  {
    key: 'marathon',
    audience: 'designer',
    metric: 'dealsCompleted',
    thresholds: { bronze: 100, silver: 250, gold: 500 },
    isHidden: true,
    icon: 'Flame',
  },
];

export const ACHIEVEMENT_KEYS = ACHIEVEMENTS.map((achievement) => achievement.key);

export function achievementByKey(key: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.key === key);
}

/**
 * Наибольший достигнутый тир для значения метрики.
 * `null` — порог бронзы ещё не взят.
 */
export function tierForValue(
  definition: AchievementDefinition,
  value: number,
): AchievementTier | null {
  if (value >= definition.thresholds.gold) return 'gold';
  if (value >= definition.thresholds.silver) return 'silver';
  if (value >= definition.thresholds.bronze) return 'bronze';
  return null;
}

/** Порядок тиров для сравнения «выросло ли достижение». */
export function tierRank(tier: AchievementTier): number {
  return ACHIEVEMENT_TIERS.indexOf(tier);
}

/** Следующий порог — для полосы прогресса на полке достижений. */
export function nextThreshold(
  definition: AchievementDefinition,
  value: number,
): { tier: AchievementTier; target: number } | null {
  for (const tier of ACHIEVEMENT_TIERS) {
    if (value < definition.thresholds[tier]) {
      return { tier, target: definition.thresholds[tier] };
    }
  }
  return null;
}

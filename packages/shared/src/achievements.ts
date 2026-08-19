/**
 * Каталог достижений (§3, §4.8; конструктор — post-MVP №9).
 *
 * Здесь остался стандартный набор и то, что действительно является кодом:
 * список метрик. Метрика — это запрос к базе, её нельзя набрать в форме, и
 * добавление новой по-прежнему требует правки кода.
 *
 * Сами достижения переехали в таблицу `achievements`: админ собирает новые
 * из готовых метрик без деплоя. Набор ниже — сид этой таблицы, поэтому
 * свежая установка выглядит ровно так же, как до конструктора.
 *
 * Подписи стандартных достижений — ключи словаря
 * (`achievements.items.<key>.title` / `.description`); у собственных текст
 * вводит админ сразу на двух языках.
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

/**
 * Что метрика означает для админа. Ключи словаря
 * (`admin.achievements.metrics.<metric>`) — подписи переводятся вместе с
 * остальным интерфейсом.
 */
export const ACHIEVEMENT_AUDIENCES = ['designer', 'customer', 'any'] as const;
export type AchievementAudience = (typeof ACHIEVEMENT_AUDIENCES)[number];

/**
 * Иконки, доступные конструктору.
 *
 * Список закрытый, и это осознанно: свободное поле «имя иконки lucide»
 * молча превращает опечатку в безымянную звёздочку у ника, а весь набор
 * lucide в клиентской сборке — лишние сотни килобайт ради одной картинки.
 */
export const ACHIEVEMENT_ICONS = [
  'Award',
  'Trophy',
  'Medal',
  'Star',
  'Crown',
  'Flame',
  'Target',
  'Zap',
  'Rocket',
  'Gem',
  'Shield',
  'Scale',
  'Handshake',
  'HeartHandshake',
  'Images',
  'Palette',
  'Boxes',
  'Clock',
  'Send',
  'FileText',
  'ClipboardList',
  'Coins',
  'Moon',
  'Sparkles',
] as const;
export type AchievementIcon = (typeof ACHIEVEMENT_ICONS)[number];

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

/** Ключ достижения: латиница, цифры и подчёркивание — он ходит в URL и словарь. */
export const ACHIEVEMENT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/u;

/**
 * Пороги в том виде, в каком их хранит таблица и принимают функции ниже.
 * Отдельный тип, потому что каталог теперь приходит из БД, а не только из
 * константы выше.
 */
export type AchievementThresholds = Record<AchievementTier, number>;

/**
 * Наибольший достигнутый тир для значения метрики.
 * `null` — порог бронзы ещё не взят.
 */
export function tierForValue(
  thresholds: AchievementThresholds,
  value: number,
): AchievementTier | null {
  if (value >= thresholds.gold) return 'gold';
  if (value >= thresholds.silver) return 'silver';
  if (value >= thresholds.bronze) return 'bronze';
  return null;
}

/** Порядок тиров для сравнения «выросло ли достижение». */
export function tierRank(tier: AchievementTier): number {
  return ACHIEVEMENT_TIERS.indexOf(tier);
}

/** Следующий порог — для полосы прогресса на полке достижений. */
export function nextThreshold(
  thresholds: AchievementThresholds,
  value: number,
): { tier: AchievementTier; target: number } | null {
  for (const tier of ACHIEVEMENT_TIERS) {
    if (value < thresholds[tier]) {
      return { tier, target: thresholds[tier] };
    }
  }
  return null;
}

import { z } from 'zod';

/**
 * Реестр настроек платформы (§1.2.6, §6 ТЗ).
 *
 * Правило проекта: любое число-порог, лимит или флаг живёт ЗДЕСЬ и редактируется
 * в админке, а не хардкодится в коде. Реестр типизирован: `getSetting('invites_default')`
 * возвращает `number`, `getSetting('ai_feature_costs')` — объект стоимостей.
 */

export type SettingGroup =
  | 'access'
  | 'orders'
  | 'deals'
  | 'ai'
  | 'reputation'
  | 'moderation'
  | 'uploads'
  | 'features';

export interface SettingDefinition<T = unknown> {
  /** Группа для вкладок в админке. */
  readonly group: SettingGroup;
  /** Значение по умолчанию — оно же используется, пока в БД нет записи. */
  readonly default: T;
  /** Схема валидации при сохранении из админки. */
  readonly schema: z.ZodType<T>;
  /** Описание для админки (ru/en). */
  readonly label: { readonly ru: string; readonly en: string };
  /** Пояснение для админки. */
  readonly hint?: { readonly ru: string; readonly en: string };
}

const byLevel = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ novice: inner, verified: inner, pro: inner, top: inner });

const levelRulesSchema = z.object({
  pro: z.object({
    ordersCompleted: z.number().int().min(0),
    rating: z.number().min(0).max(5),
    onTimePct: z.number().min(0).max(100),
    disputesLostWindowDays: z.number().int().min(0),
    disputesLostMax: z.number().int().min(0),
  }),
  top: z.object({
    ordersCompleted: z.number().int().min(0),
    rating: z.number().min(0).max(5),
    onTimePct: z.number().min(0).max(100),
    quotaPct: z.number().min(0).max(100),
    manualApproval: z.boolean(),
  }),
});

const rateLimitRule = z.object({
  points: z.number().int().min(1),
  windowSeconds: z.number().int().min(1),
});

/**
 * Определение реестра. `satisfies` даёт проверку формы, а `as const` сохраняет
 * литеральные типы значений по умолчанию — из них выводится тип значения настройки.
 */
export const SETTINGS_REGISTRY = {
  // ── Доступ и инвайты ────────────────────────────────────────────────
  invites_default: {
    group: 'access',
    default: 3,
    schema: z.number().int().min(0).max(100),
    label: { ru: 'Инвайтов новому пользователю', en: 'Invites per new user' },
    hint: {
      ru: 'Сколько инвайт-кодов получает пользователь при регистрации',
      en: 'How many invite codes a user receives on sign-up',
    },
  },
  registration_invite_only: {
    group: 'access',
    default: true,
    schema: z.boolean(),
    label: { ru: 'Регистрация только по инвайту', en: 'Invite-only registration' },
    hint: {
      ru: 'Закрытая бета. Выключение открывает свободную регистрацию',
      en: 'Closed beta. Turning off enables open sign-up',
    },
  },
  waitlist_enabled: {
    group: 'access',
    default: true,
    schema: z.boolean(),
    label: { ru: 'Лист ожидания на лендинге', en: 'Landing waitlist' },
  },

  // ── Заказы и отклики ────────────────────────────────────────────────
  responses_per_day: {
    group: 'orders',
    default: { novice: 10, verified: 20, pro: 30, top: 50 },
    schema: byLevel(z.number().int().min(0).max(1000)),
    label: { ru: 'Откликов в день по уровням', en: 'Daily responses by level' },
  },
  max_active_orders_per_customer: {
    group: 'orders',
    default: 10,
    schema: z.number().int().min(1).max(500),
    label: { ru: 'Активных заказов на заказчика', en: 'Active orders per customer' },
  },
  comment_max_length: {
    group: 'moderation',
    default: 2000,
    schema: z.number().int().min(50).max(10_000),
    label: { ru: 'Длина комментария к работе, символов', en: 'Work comment length, characters' },
  },
  comment_edit_minutes: {
    group: 'moderation',
    default: 15,
    schema: z.number().int().min(0).max(1440),
    label: { ru: 'Окно правки комментария, минут', en: 'Comment edit window, minutes' },
    hint: {
      ru: 'Ноль — править нельзя вовсе; после окна остаётся только удалить',
      en: 'Zero disables editing; after the window only deletion is left',
    },
  },
  order_autoarchive_days: {
    group: 'orders',
    default: 30,
    schema: z.number().int().min(1).max(365),
    label: { ru: 'Автоархив заказа, дней без активности', en: 'Order auto-archive, idle days' },
  },
  order_inactive_customer_days: {
    group: 'orders',
    default: 7,
    schema: z.number().int().min(1).max(90),
    label: { ru: 'Молчание заказчика до пометки «неактивен», дней', en: 'Days until customer marked inactive' },
  },

  // ── Аукцион (post-MVP №1). Работает только при feature_auction. ──────────
  auction_min_duration_hours: {
    group: 'orders',
    default: 12,
    schema: z.number().int().min(1).max(720),
    label: { ru: 'Минимальная длительность торгов, часов', en: 'Minimum auction duration, hours' },
    hint: {
      ru: 'Слишком короткие торги отсекают дизайнеров из других часовых поясов',
      en: 'Very short auctions cut off designers in other time zones',
    },
  },
  auction_max_duration_days: {
    group: 'orders',
    default: 14,
    schema: z.number().int().min(1).max(90),
    label: { ru: 'Максимальная длительность торгов, дней', en: 'Maximum auction duration, days' },
  },
  auction_min_decrement_pct: {
    group: 'orders',
    default: 2,
    schema: z.number().min(0).max(50),
    label: { ru: 'Минимальный шаг снижения ставки, %', en: 'Minimum bid decrement, %' },
    hint: {
      ru: 'В открытом аукционе новая ставка дизайнера должна быть ниже прежней хотя бы на столько',
      en: 'In an open auction a designer’s new bid must undercut their previous one by at least this much',
    },
  },
  auction_winner_response_hours: {
    group: 'orders',
    default: 48,
    schema: z.number().int().min(1).max(336),
    label: { ru: 'Срок ответа победителя торгов, часов', en: 'Auction winner response window, hours' },
    hint: {
      ru: 'Торги необязывающие: по истечении срока выбор снимается, отказ идёт в метрику надёжности',
      en: 'Bids are non-binding: after this the pick expires and counts against the reliability metric',
    },
  },
  auction_ending_soon_hours: {
    group: 'orders',
    default: 6,
    schema: z.number().int().min(1).max(72),
    label: { ru: 'Напоминание «торги скоро закончатся», часов до конца', en: 'Ending-soon reminder, hours before close' },
  },
  auction_max_bids_per_designer: {
    group: 'orders',
    default: 10,
    schema: z.number().int().min(1).max(100),
    label: { ru: 'Максимум ставок одного дизайнера в торгах', en: 'Maximum bids per designer per auction' },
  },

  // ── Сделки, файлы, оплаты ───────────────────────────────────────────
  deal_files_limit_gb: {
    group: 'deals',
    default: 2,
    schema: z.number().min(0.1).max(100),
    label: { ru: 'Лимит файлов на сделку, ГБ', en: 'Deal files limit, GB' },
  },
  deal_files_retention_days: {
    group: 'deals',
    default: 90,
    schema: z.number().int().min(7).max(3650),
    label: { ru: 'Хранение файлов сделки, дней', en: 'Deal files retention, days' },
  },
  milestones_max: {
    group: 'deals',
    default: 10,
    schema: z.number().int().min(1).max(50),
    label: { ru: 'Максимум этапов в сделке', en: 'Max milestones per deal' },
  },
  payment_stuck_reminder_days: {
    group: 'deals',
    default: [1, 3],
    schema: z.array(z.number().int().min(1).max(60)).min(1).max(5),
    label: { ru: 'Напоминания о неподтверждённой оплате, дни', en: 'Unconfirmed payment reminders, days' },
  },
  deadline_reminder_hours: {
    group: 'deals',
    default: [48, 24],
    schema: z.array(z.number().int().min(1).max(720)).min(1).max(5),
    label: { ru: 'Напоминания о дедлайне, часов до срока', en: 'Deadline reminders, hours before' },
  },
  receipt_random_check_pct: {
    group: 'deals',
    default: 10,
    schema: z.number().int().min(0).max(100),
    label: { ru: 'Доля чеков на выборочную проверку, %', en: 'Receipts sampled for review, %' },
  },
  receipt_check_all: {
    group: 'deals',
    default: true,
    schema: z.boolean(),
    label: { ru: 'Проверять все чеки (режим беты)', en: 'Review every receipt (beta mode)' },
  },

  // ── ИИ ──────────────────────────────────────────────────────────────
  ai_credits_monthly: {
    group: 'ai',
    default: { brief_generate: 10, general_pool: 100 },
    schema: z.object({
      brief_generate: z.number().int().min(0),
      general_pool: z.number().int().min(0),
    }),
    label: { ru: 'Месячный лимит ИИ-кредитов', en: 'Monthly AI credit allowance' },
  },
  ai_feature_costs: {
    group: 'ai',
    default: {
      brief_generate: 1,
      brief_review: 1,
      brief_clarify: 1,
      match_designers: 1,
      translate_msg: 0,
      improve_text: 1,
      estimate: 1,
      chat_summary: 1,
      onboarding_parse: 1,
      field_hint: 1,
      dispute_summary: 1,
      content_translate: 0,
    },
    schema: z.record(z.string(), z.number().int().min(0)),
    label: { ru: 'Стоимость ИИ-фич в кредитах', en: 'AI feature cost in credits' },
  },
  ai_model_strong: {
    group: 'ai',
    default: 'gpt-4o',
    schema: z.string().min(1).max(64),
    label: { ru: 'Модель для генерации ТЗ и арбитража', en: 'Model for brief generation and arbitration' },
  },
  ai_model_cheap: {
    group: 'ai',
    default: 'gpt-4o-mini',
    schema: z.string().min(1).max(64),
    label: { ru: 'Модель для перевода и мелких задач', en: 'Model for translation and small tasks' },
  },

  // ── Репутация ───────────────────────────────────────────────────────
  review_blind_days: {
    group: 'reputation',
    default: 14,
    schema: z.number().int().min(1).max(90),
    label: { ru: 'Двойное слепое: публикация через N дней', en: 'Double-blind reviews: publish after N days' },
  },
  review_edit_hours: {
    group: 'reputation',
    default: 72,
    schema: z.number().int().min(0).max(720),
    label: { ru: 'Правка отзыва автором, часов', en: 'Review edit window, hours' },
  },
  review_text_min_length: {
    group: 'reputation',
    default: 20,
    schema: z.number().int().min(0).max(2000),
    label: { ru: 'Минимальная длина отзыва', en: 'Minimum review length' },
  },
  rating_half_life_days: {
    group: 'reputation',
    default: 180,
    schema: z.number().int().min(7).max(3650),
    label: { ru: 'Полураспад веса отзыва, дней', en: 'Review weight half-life, days' },
  },
  level_rules: {
    group: 'reputation',
    default: {
      pro: {
        ordersCompleted: 15,
        rating: 4.5,
        onTimePct: 85,
        disputesLostWindowDays: 90,
        disputesLostMax: 0,
      },
      top: {
        ordersCompleted: 40,
        rating: 4.8,
        onTimePct: 95,
        quotaPct: 5,
        manualApproval: true,
      },
    },
    schema: levelRulesSchema,
    label: { ru: 'Правила уровней дизайнера', en: 'Designer level rules' },
  },
  featured_designer_userId: {
    group: 'reputation',
    default: '',
    schema: z.string().max(64),
    label: { ru: 'Дизайнер недели (id пользователя)', en: 'Designer of the week (user id)' },
  },

  // ── Модерация ───────────────────────────────────────────────────────
  strike_expiry_days: {
    group: 'moderation',
    default: 180,
    schema: z.number().int().min(1).max(3650),
    label: { ru: 'Срок жизни страйка, дней', en: 'Strike lifetime, days' },
  },
  strikes_to_temp_ban: {
    group: 'moderation',
    default: 3,
    schema: z.number().int().min(1).max(20),
    label: { ru: 'Страйков до временного бана', en: 'Strikes until temporary ban' },
  },
  temp_ban_days: {
    group: 'moderation',
    default: 7,
    schema: z.number().int().min(1).max(365),
    label: { ru: 'Длительность временного бана, дней', en: 'Temporary ban length, days' },
  },
  verification_retry_days: {
    group: 'moderation',
    default: 14,
    schema: z.number().int().min(1).max(365),
    label: { ru: 'Повторная подача на верификацию через, дней', en: 'Verification retry after, days' },
  },
  rate_limits: {
    group: 'moderation',
    default: {
      login: { points: 10, windowSeconds: 300 },
      register: { points: 5, windowSeconds: 3600 },
      password_reset: { points: 5, windowSeconds: 3600 },
      ai: { points: 30, windowSeconds: 3600 },
      upload: { points: 60, windowSeconds: 3600 },
      response: { points: 30, windowSeconds: 3600 },
      bid: { points: 60, windowSeconds: 3600 },
      telegram_link: { points: 10, windowSeconds: 3600 },
      comment: { points: 30, windowSeconds: 3600 },
      organization: { points: 20, windowSeconds: 3600 },
      push_subscribe: { points: 30, windowSeconds: 3600 },
      message: { points: 120, windowSeconds: 60 },
    },
    schema: z.record(z.string(), rateLimitRule),
    label: { ru: 'Лимиты частоты запросов', en: 'Rate limits' },
  },

  // ── Загрузки ────────────────────────────────────────────────────────
  upload_image_mb: {
    group: 'uploads',
    default: 15,
    schema: z.number().int().min(1).max(200),
    label: { ru: 'Размер изображения, МБ', en: 'Image size limit, MB' },
  },
  upload_video_mb: {
    group: 'uploads',
    default: 200,
    schema: z.number().int().min(1).max(5000),
    label: { ru: 'Размер видео, МБ', en: 'Video size limit, MB' },
  },
  work_images_max: {
    group: 'uploads',
    default: 15,
    schema: z.number().int().min(1).max(100),
    label: { ru: 'Изображений в одной работе', en: 'Images per portfolio work' },
  },

  // ── Feature-флаги (§1.2.2 — задел на будущее, в MVP выключено) ──────
  /**
   * Шкала комиссии (§1.2.2): 15/10/5 % по числу завершённых сделок.
   *
   * Пороги и проценты — настройка, а не константа: ставка комиссии —
   * последнее, что стоит менять деплоем.
   */
  commission_tiers: {
    group: 'deals',
    default: [
      { fromDeals: 0, percent: 15 },
      { fromDeals: 10, percent: 10 },
      { fromDeals: 30, percent: 5 },
    ],
    schema: z
      .array(
        z.object({
          fromDeals: z.number().int().min(0),
          percent: z.number().min(0).max(50),
        }),
      )
      .min(1)
      .max(6),
    label: { ru: 'Шкала комиссии, %', en: 'Commission schedule, %' },
    hint: {
      ru: 'Применяется только при включённых комиссиях. Действует самая выгодная подходящая ставка',
      en: 'Applies only when commissions are on. The most favourable matching rate wins',
    },
  },
  feature_commissions: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Комиссии платформы', en: 'Platform commissions' },
    hint: {
      ru: 'Требует юрлица. Пока выключено, комиссия равна нулю везде, включая расчёты и показ',
      en: 'Requires a legal entity. While off, the commission is zero everywhere, in maths and on screen',
    },
  },
  feature_payments: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Платёжный модуль', en: 'Payments module' },
    hint: {
      ru: 'Требует юрлица и договора с провайдером. Сегодня доступен только ручной режим: стороны платят сами, платформа фиксирует чеки',
      en: 'Requires a legal entity and a provider contract. Only the manual mode exists today: the sides pay each other, the platform records receipts',
    },
  },
  feature_auction: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Аукцион заказов', en: 'Order auction' },
  },
  feature_organizations: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Команды и студии', en: 'Teams and studios' },
    hint: {
      ru: 'Общие ТЗ и заказы для нескольких человек; стороной сделки остаётся человек',
      en: 'Shared briefs and orders for several people; the deal party is still a person',
    },
  },
  feature_public_templates: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Публичные шаблоны ТЗ', en: 'Public brief templates' },
  },
  feature_work_comments: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Комментарии к работам', en: 'Comments on works' },
  },
  feature_ai_matching: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'ИИ-подбор исполнителей', en: 'AI designer matching' },
    hint: {
      ru: 'Без флага подбор работает по тегам, без объяснений от модели',
      en: 'With the flag off, matching runs on tags alone, without model explanations',
    },
  },
  feature_brief_chat: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'ИИ-чат уточнений ТЗ', en: 'AI brief clarification chat' },
  },
  feature_telegram: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Telegram-уведомления', en: 'Telegram notifications' },
  },
  feature_subscriptions: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Подписки', en: 'Subscriptions' },
    hint: {
      ru: 'Тарифы с надбавками к лимитам. Продажа требует платёжного модуля; сейчас тариф выдаёт администратор',
      en: 'Plans with limit boosts. Selling requires the payments module; for now a plan is granted by an admin',
    },
  },
  feature_promotions: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Буст и featured', en: 'Boost and featured' },
    hint: {
      ru: 'Поднятие заказа в выдаче и место в подборке. Выдаётся администратором, продажа — вместе с платёжным модулем',
      en: 'Raising an order in the listing and a slot in the selection. Granted by an admin; selling comes with the payments module',
    },
  },
  feature_ai_assistant: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Единый ИИ-ассистент', en: 'Unified AI assistant' },
    hint: {
      ru: 'Одна точка входа во все ИИ-возможности; сам ничего не выполняет, а доводит до кнопки',
      en: 'One entry point to every AI capability; it does nothing itself, it leads to the button',
    },
  },
  feature_achievement_builder: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'Конструктор достижений', en: 'Achievement builder' },
    hint: {
      ru: 'Создание своих достижений в админке; стандартный набор работает и без флага',
      en: 'Creating custom achievements in the admin panel; the standard set works without the flag',
    },
  },
  feature_pwa: {
    group: 'features',
    default: false,
    schema: z.boolean(),
    label: { ru: 'PWA и пуш-уведомления', en: 'PWA and push notifications' },
  },
} as const satisfies Record<string, SettingDefinition<unknown>>;

export type SettingKey = keyof typeof SETTINGS_REGISTRY;

/**
 * Тип значения настройки выводится из её zod-схемы, а не из литерала default:
 * иначе `as const` сузил бы `[1, 3]` до кортежа вместо `number[]`.
 */
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS_REGISTRY)[K]['schema']>;

export const SETTING_KEYS = Object.keys(SETTINGS_REGISTRY) as SettingKey[];

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === 'string' && value in SETTINGS_REGISTRY;
}

export function getSettingDefault<K extends SettingKey>(key: K): SettingValue<K> {
  return SETTINGS_REGISTRY[key].default as SettingValue<K>;
}

/** Валидация значения настройки перед записью из админки. */
export function parseSettingValue<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  const definition = SETTINGS_REGISTRY[key] as SettingDefinition<unknown>;
  return definition.schema.parse(value) as SettingValue<K>;
}

/** Все значения по умолчанию — используется в seed и как fallback. */
export function allSettingDefaults(): Record<SettingKey, unknown> {
  const result = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) {
    result[key] = SETTINGS_REGISTRY[key].default;
  }
  return result;
}

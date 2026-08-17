/** Название бренда. Меняется в одном месте — см. §8.1 ТЗ. */
export const BRAND_NAME = process.env.BRAND_NAME ?? 'PolyForge';

/** Контекст (роль) интерфейса: один аккаунт — два профиля. */
export const ROLE_CONTEXTS = ['designer', 'customer'] as const;
export type RoleContext = (typeof ROLE_CONTEXTS)[number];

export const THEMES = ['dark', 'light', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** Имена cookie. Собраны в одном месте, чтобы не разъезжались между app/ws. */
export const COOKIES = {
  accessToken: 'pf_at',
  refreshToken: 'pf_rt',
  roleContext: 'pf_role',
  theme: 'pf_theme',
  locale: 'NEXT_LOCALE',
  inviteCode: 'pf_invite',
} as const;

/** Время жизни токенов. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15; // 15 минут
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дней
export const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24; // 24 часа
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1 час

/** Ограничения полей форм (валидация zod ссылается на них). */
export const LIMITS = {
  passwordMin: 8,
  passwordMax: 128,
  nicknameMin: 2,
  nicknameMax: 32,
  bioMax: 2000,
  emailMax: 254,
  inviteCodeLength: 10,
} as const;

/** Разрешённые символы ника: латиница/кириллица/цифры/подчёркивание/дефис. */
export const NICKNAME_PATTERN = /^[\p{L}\p{N}_-]+$/u;

/** Ключи очередей BullMQ — общие для app (продюсер) и worker (консьюмер). */
export const QUEUES = {
  email: 'email',
  media: 'media',
  ai: 'ai',
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Каналы Redis pub/sub между app и ws-сервисом. */
export const REALTIME_CHANNELS = {
  notification: 'rt:notification',
  message: 'rt:message',
  presence: 'rt:presence',
} as const;

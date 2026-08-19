import 'server-only';

import { z } from 'zod';

/**
 * Валидация переменных окружения. Лучше упасть на старте контейнера,
 * чем отдать пользователю 500 из-за пустого секрета.
 *
 * Проверка ленивая: `next build` собирает страницы без прод-секретов, и
 * падение на этапе импорта модуля сломало бы сборку образа. Первое реальное
 * обращение к `env.X` в рантайме проверит конфигурацию целиком.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BRAND_NAME: z.string().min(1).default('PolyForge'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  AUTH_JWT_SECRET: z.string().min(32, 'минимум 32 символа'),
  AUTH_REFRESH_SECRET: z.string().min(32, 'минимум 32 символа'),
  AUTH_TOKEN_PEPPER: z.string().min(16, 'минимум 16 символов'),

  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),

  TURNSTILE_SECRET_KEY: z.string().default(''),

  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('PolyForge <noreply@example.com>'),
  EMAIL_TRANSPORT: z.enum(['console', 'resend']).default('console'),

  // Хранилище файлов. В локальной разработке — диск, в проде — S3.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.data/uploads'),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('ru-1'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_BUCKET_PUBLIC: z.string().default('polyforge-public'),
  S3_BUCKET_PRIVATE: z.string().default('polyforge-private'),
  S3_PUBLIC_BASE_URL: z.string().default(''),

  // ИИ. Без ключа поднимается детерминированная заглушка (см. packages/ai).
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),

  // Telegram-бот. Без токена поднимается заглушка (см. packages/telegram).
  // Имя бота нужно для диплинка привязки, секрет — для проверки вебхука.
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),

  // Веб-пуши. Без пары ключей VAPID поднимается заглушка (packages/webpush).
  // Пара генерируется один раз: npm run push:keys.
  WEB_PUSH_PUBLIC_KEY: z.string().default(''),
  WEB_PUSH_PRIVATE_KEY: z.string().default(''),
  // Контакт на случай, если сервис доставки захочет пожаловаться.
  WEB_PUSH_SUBJECT: z.string().default('mailto:hello@polyforge.local'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

function parseServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** Читается как обычный объект; валидация срабатывает при первом обращении. */
export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, property) {
    return parseServerEnv()[property as keyof ServerEnv];
  },
  has(_target, property) {
    return property in parseServerEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(parseServerEnv());
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  },
});

/**
 * NEXT_PUBLIC_* инлайнятся сборщиком, поэтому обращаемся к ним по полному имени
 * и не валидируем строго: у всех есть безопасные значения по умолчанию.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().catch('http://localhost:3000'),
  NEXT_PUBLIC_WS_URL: z.string().url().catch('http://localhost:4000'),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().catch(''),
  /// Идентификаторы аналитики (§7, фаза 7). Пусто — счётчики не подключаются.
  NEXT_PUBLIC_YM_ID: z.string().catch(''),
  NEXT_PUBLIC_GA_ID: z.string().catch(''),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_YM_ID: process.env.NEXT_PUBLIC_YM_ID,
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
});

// Режим определяем напрямую: он не требует валидации остальных секретов.
export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';

/** Абсолютный URL для писем и OAuth-редиректов. */
export function absoluteUrl(path: string): string {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

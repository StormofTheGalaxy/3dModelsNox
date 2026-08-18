import { createTelegramProvider } from '@polyforge/telegram';

/**
 * Регистрация вебхука бота. Запускается разово при развёртывании:
 *
 *   npm run telegram:webhook
 *
 * Telegram считает адрес вебхука частью конфигурации бота и помнит его сам,
 * поэтому дёргать setWebhook на каждом старте приложения не нужно — это
 * лишний внешний вызов на пути, где он ничего не решает.
 */

const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN не задан — регистрировать нечего.');
  process.exit(1);
}

if (!secret) {
  console.error(
    'TELEGRAM_WEBHOOK_SECRET не задан. Без него вебхук примет запрос от кого угодно.',
  );
  process.exit(1);
}

if (!appUrl.startsWith('https://')) {
  // Telegram доставляет вебхуки только по HTTPS — молча ничего не приходило бы.
  console.error(`NEXT_PUBLIC_APP_URL должен быть https, получено: ${appUrl || '(пусто)'}`);
  process.exit(1);
}

const url = `${appUrl}/api/telegram/webhook`;
const result = await createTelegramProvider(token).setWebhook(url, secret);

if (!result.ok) {
  console.error(`Не удалось зарегистрировать вебхук: ${result.error ?? 'неизвестная ошибка'}`);
  process.exit(1);
}

console.info(`✓ вебхук зарегистрирован: ${url}`);

import 'server-only';

import { prisma } from '@polyforge/db';
import {
  createTelegramProvider,
  escapeHtml,
  type TelegramProvider,
} from '@polyforge/telegram';
import { getEmailTranslator } from '@polyforge/mail';
import type { Locale, NotificationType } from '@polyforge/shared';

import { absoluteUrl, env } from './env';
import { getSetting } from './settings';

/**
 * Telegram-бот как третий канал уведомлений (§3, §4.7; post-MVP №2).
 *
 * Канал односторонний: бот доставляет то же, что уходит письмом, и понимает
 * только команды привязки. Вести переписку в Telegram платформе незачем —
 * чат сделки живёт на сайте, где есть файлы, цитаты и история.
 */

let cached: TelegramProvider | null = null;

export function telegramProvider(): TelegramProvider {
  cached ??= createTelegramProvider(env.TELEGRAM_BOT_TOKEN);
  return cached;
}

/** Настроен ли настоящий бот. UI честно говорит, когда это заглушка. */
export function telegramIsLive(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

export async function telegramEnabled(): Promise<boolean> {
  return getSetting('feature_telegram');
}

/** Диплинк привязки: /start с одноразовым токеном. */
export function linkDeepLink(token: string): string {
  const bot = env.TELEGRAM_BOT_USERNAME.replace(/^@/, '');
  return `https://t.me/${bot}?start=${token}`;
}

/**
 * Доставка уведомления в Telegram.
 *
 * Возвращает `false`, если отправлять было некому или нечему — вызывающий
 * код по этому признаку не ставит отметку о доставке.
 */
export async function sendTelegramNotification(input: {
  userId: string;
  type: NotificationType;
  payload: Record<string, string | number | boolean>;
  link: string;
}): Promise<boolean> {
  if (!(await telegramEnabled())) return false;

  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      locale: true,
      telegramChatId: true,
      telegramNotifications: true,
      status: true,
    },
  });

  if (!recipient?.telegramChatId || !recipient.telegramNotifications) return false;
  if (recipient.status === 'banned' || recipient.status === 'deleted') return false;

  const locale = recipient.locale as Locale;
  const t = getEmailTranslator(locale);
  const values = Object.fromEntries(
    Object.entries(input.payload).map(([key, value]) => [key, String(value)]),
  );

  // Тексты те же, что в письме и в колокольчике: третий канал не повод
  // заводить третий набор формулировок.
  const title = escapeHtml(t(`notifications.${input.type}.title`, values));
  const body = escapeHtml(t(`notifications.${input.type}.body`, values));

  const result = await telegramProvider().sendMessage(recipient.telegramChatId, {
    text: `<b>${title}</b>\n\n${body}`,
    actionUrl: absoluteUrl(`/${locale}${input.link}`),
    actionLabel: t(`notifications.${input.type}.action`),
  });

  // Заблокированный бот — это осознанный отказ пользователя, а не сбой сети.
  // Отвязываем чат, чтобы не долбиться в него до конца времён.
  if (result.blocked) {
    await prisma.user.update({
      where: { id: input.userId },
      data: { telegramChatId: null, telegramLinkedAt: null, telegramUsername: null },
    });
    return false;
  }

  if (!result.ok) {
    console.error('[telegram] сообщение не ушло', result.error);
    return false;
  }

  return true;
}

import { BotApiProvider } from './bot-api';
import { StubTelegramProvider } from './stub';
import type { TelegramCommand, TelegramProvider } from './types';

export * from './types';
export { BotApiProvider } from './bot-api';
export { StubTelegramProvider } from './stub';

/**
 * Выбор реализации. Без токена поднимается заглушка — как и у ИИ-провайдера:
 * фича целиком проходима локально, а `provider.isLive` говорит интерфейсу,
 * что настоящих сообщений не будет.
 */
export function createTelegramProvider(token: string): TelegramProvider {
  return token ? new BotApiProvider(token) : new StubTelegramProvider();
}

/** Экранирование под parse_mode: HTML — ники и заголовки приходят от людей. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
    from?: { username?: string };
  };
}

/**
 * Разбор входящего обновления. Возвращает `null` на всём, что не команда:
 * бот односторонний, свободный текст ему адресовать бессмысленно.
 */
export function parseCommand(update: unknown): TelegramCommand | null {
  const message = (update as TelegramUpdate | null)?.message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;

  if (!text || chatId === undefined || chatId === null) return null;
  if (!text.startsWith('/')) return null;

  // В группах команды приходят как «/start@my_bot» — суффикс отбрасываем.
  const [rawCommand, ...rest] = text.slice(1).split(/\s+/u);
  const command = (rawCommand ?? '').split('@')[0]?.toLowerCase() ?? '';
  if (!command) return null;

  return {
    chatId: String(chatId),
    username: message?.from?.username ?? null,
    command,
    argument: rest.length > 0 ? rest.join(' ') : null,
  };
}

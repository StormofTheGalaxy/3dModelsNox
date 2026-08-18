import type { TelegramMessage, TelegramProvider, TelegramSendResult } from './types';

/**
 * Заглушка бота — для локальной разработки и CI, где токена нет и быть
 * не должно.
 *
 * Смысл тот же, что у заглушки ИИ: весь путь фичи (привязка чата, выбор
 * канала по настройкам, отметка о доставке) работает и проверяется без
 * внешнего вызова. Отправленное складывается в память, чтобы сценарий мог
 * убедиться, что сообщение действительно собралось.
 */
export class StubTelegramProvider implements TelegramProvider {
  readonly isLive = false;

  private readonly outbox: { chatId: string; message: TelegramMessage }[] = [];

  sendMessage(chatId: string, message: TelegramMessage): Promise<TelegramSendResult> {
    this.outbox.push({ chatId, message });
    console.info(`[telegram:stub] → ${chatId}: ${message.text.replace(/\n/g, ' ').slice(0, 120)}`);
    return Promise.resolve({ ok: true, blocked: false });
  }

  setWebhook(): Promise<{ ok: boolean; error?: string }> {
    console.info('[telegram:stub] вебхук не регистрируется: бот не настроен');
    return Promise.resolve({ ok: true });
  }

  /** Что «ушло» за время жизни процесса — только для тестов и отладки. */
  sent(): readonly { chatId: string; message: TelegramMessage }[] {
    return this.outbox;
  }
}

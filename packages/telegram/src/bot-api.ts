import type {
  TelegramMessage,
  TelegramProvider,
  TelegramSendResult,
} from './types';

/**
 * Настоящий бот поверх Telegram Bot API.
 *
 * Без библиотеки: нужны два метода из сотни, а зависимость на клиент бота
 * тянет polling, сцены и хранилище состояний — всё, чего у нас нет.
 */
export class BotApiProvider implements TelegramProvider {
  readonly isLive = true;

  constructor(
    private readonly token: string,
    private readonly timeoutMs = 8000,
  ) {}

  private async call(
    method: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; description?: string; errorCode?: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = (await response.json()) as {
        ok: boolean;
        description?: string;
        error_code?: number;
      };

      return { ok: data.ok, description: data.description, errorCode: data.error_code };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendMessage(chatId: string, message: TelegramMessage): Promise<TelegramSendResult> {
    try {
      const result = await this.call('sendMessage', {
        chat_id: chatId,
        text: message.text,
        parse_mode: 'HTML',
        // Ссылка уже есть кнопкой — превью сайта под каждым уведомлением
        // превращает ленту в простыню.
        link_preview_options: { is_disabled: true },
        ...(message.actionUrl && message.actionLabel
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: message.actionLabel, url: message.actionUrl }]],
              },
            }
          : {}),
      });

      if (result.ok) return { ok: true, blocked: false };

      // 403 — пользователь заблокировал бота или удалил чат. Это не сбой
      // доставки, а осознанный отказ: чат надо отвязать, а не ретраить.
      const blocked = result.errorCode === 403;
      return { ok: false, blocked, error: result.description ?? 'telegram error' };
    } catch (error) {
      return {
        ok: false,
        blocked: false,
        error: error instanceof Error ? error.message : 'telegram request failed',
      };
    }
  }

  async setWebhook(url: string, secret: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await this.call('setWebhook', {
        url,
        secret_token: secret,
        // Бот принимает только сообщения: инлайн-запросы и правки нам не нужны.
        allowed_updates: ['message'],
        drop_pending_updates: true,
      });

      return { ok: result.ok, error: result.description };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'setWebhook failed' };
    }
  }
}

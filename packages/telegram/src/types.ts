/**
 * Telegram как третий канал уведомлений (§3, §4.7; post-MVP №2).
 *
 * Наружу торчит узкий интерфейс: отправить сообщение и настроить вебхук.
 * Всё остальное, что умеет Bot API, платформе не нужно — бот односторонний,
 * диалогов он не ведёт, кроме привязки и отвязки аккаунта.
 */

export interface TelegramMessage {
  /** Уже собранный текст на языке получателя. */
  text: string;
  /** Абсолютная ссылка «открыть на сайте» — уходит кнопкой под сообщением. */
  actionUrl?: string;
  actionLabel?: string;
}

export interface TelegramSendResult {
  ok: boolean;
  /** Telegram сказал, что чат недоступен: пользователь заблокировал бота. */
  blocked: boolean;
  error?: string;
}

/** Разобранное входящее сообщение. Нас интересуют только команды. */
export interface TelegramCommand {
  chatId: string;
  username: string | null;
  /** Команда без слэша: start, stop, help. */
  command: string;
  /** Аргумент после команды — для /start это токен привязки. */
  argument: string | null;
}

export interface TelegramProvider {
  /** Настоящий бот или заглушка. UI предупреждает, когда бот не настроен. */
  readonly isLive: boolean;

  sendMessage(chatId: string, message: TelegramMessage): Promise<TelegramSendResult>;

  /**
   * Зарегистрировать вебхук. Вызывается разово из скрипта развёртывания,
   * а не на каждом старте: Telegram считает это изменением конфигурации.
   */
  setWebhook(url: string, secret: string): Promise<{ ok: boolean; error?: string }>;
}

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly blocked = false,
  ) {
    super(message);
    this.name = 'TelegramError';
  }
}

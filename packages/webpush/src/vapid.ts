import webpush from 'web-push';

import type {
  WebPushMessage,
  WebPushProvider,
  WebPushSendResult,
  WebPushSubscription,
} from './types';

/**
 * Настоящая отправка через VAPID.
 *
 * Полезная нагрузка шифруется ключами самой подписки, поэтому сервис
 * доставки (Google, Mozilla, Apple) видит только адрес, но не текст. Это
 * важно: мимо него ходят заголовки сделок и ники людей.
 */
export class VapidWebPushProvider implements WebPushProvider {
  readonly isLive = true;

  constructor(
    readonly publicKey: string,
    privateKey: string,
    subject: string,
  ) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(
    subscription: WebPushSubscription,
    message: WebPushMessage,
  ): Promise<WebPushSendResult> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(message),
        {
          // Сутки: уведомление о новом отклике, доставленное на третий день,
          // уже не новость. Дальше сервис доставки его выбрасывает сам.
          TTL: 24 * 60 * 60,
          urgency: 'normal',
        },
      );

      return { ok: true, expired: false };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;

      return {
        ok: false,
        // 404 и 410 — подписки больше нет; всё остальное лечится повтором.
        expired: status === 404 || status === 410,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

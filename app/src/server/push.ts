import 'server-only';

import { prisma } from '@polyforge/db';
import {
  createWebPushProvider,
  type WebPushProvider,
  type WebPushSubscription,
} from '@polyforge/webpush';
import { getEmailTranslator } from '@polyforge/mail';
import type { Locale, NotificationType } from '@polyforge/shared';

import { env } from './env';
import { getSetting } from './settings';

/**
 * Веб-пуши как четвёртый канал уведомлений (§4.7, post-MVP №8).
 *
 * Отличие от письма и Telegram в том, что подписка принадлежит устройству,
 * а не человеку: она протухает молча — при переустановке браузера, очистке
 * данных сайта, смене телефона. Поэтому единственная реакция на «подписки
 * больше нет» — удалить запись, а не копить мёртвые адреса и повторы.
 */

let cached: WebPushProvider | null = null;

export function webPushProvider(): WebPushProvider {
  cached ??= createWebPushProvider(
    env.WEB_PUSH_PUBLIC_KEY,
    env.WEB_PUSH_PRIVATE_KEY,
    env.WEB_PUSH_SUBJECT,
  );
  return cached;
}

/** Настроены ли настоящие ключи. UI честно говорит, когда это заглушка. */
export function pushIsLive(): boolean {
  return webPushProvider().isLive;
}

export async function pushEnabled(): Promise<boolean> {
  return getSetting('feature_pwa');
}

/** Публичный ключ VAPID: браузер требует его при оформлении подписки. */
export function pushPublicKey(): string {
  return webPushProvider().publicKey;
}

export async function listPushSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userAgent: true, createdAt: true, lastSentAt: true },
  });
}

/**
 * Доставка уведомления на все устройства пользователя.
 *
 * Возвращает число устройств, куда оно ушло: вызывающий код по нему решает,
 * ставить ли отметку о доставке.
 */
export async function sendWebPushNotification(input: {
  userId: string;
  type: NotificationType;
  payload: Record<string, string | number | boolean>;
  link: string;
  locale: Locale;
}): Promise<number> {
  if (!(await pushEnabled())) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: input.userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return 0;

  const t = getEmailTranslator(input.locale);
  const values = Object.fromEntries(
    Object.entries(input.payload).map(([key, value]) => [key, String(value)]),
  );

  const message = {
    title: t(`notifications.${input.type}.title`, values),
    body: t(`notifications.${input.type}.body`, values),
    url: `/${input.locale}${input.link}`,
    // Тег по типу события: второе «новый отклик» заменяет первое, а не
    // ложится сверху. Стопка одинаковых уведомлений — это шум, а не десять
    // поводов открыть приложение.
    tag: input.type,
  };

  const provider = webPushProvider();
  const expired: string[] = [];
  const delivered: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const target: WebPushSubscription = {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      };

      const result = await provider.send(target, message);

      if (result.ok) delivered.push(subscription.id);
      else if (result.expired) expired.push(subscription.id);
      else console.error('[push] не доставлено', result.error);
    }),
  );

  // Протухшие подписки удаляем сразу: держать их — значит каждый раз
  // ходить в сервис доставки за тем же 410.
  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
  }

  if (delivered.length > 0) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: delivered } },
      data: { lastSentAt: new Date() },
    });
  }

  return delivered.length;
}

import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';
import { REALTIME_CHANNELS, type Locale, type NotificationType } from '@polyforge/shared';

import { getEmailTranslator } from '@polyforge/mail';

import { absoluteUrl } from './env';
import { sendNotificationEmail } from './mail';
import { redis } from './redis';

/**
 * Уведомления (§4.7): in-app плюс email по настройкам подписок.
 *
 * Запись в БД — источник правды; ws только доставляет её в открытую вкладку.
 * Если реалтайм-сервис лежит, пользователь увидит колокольчик при следующей
 * загрузке страницы.
 *
 * Тексты собираются здесь и на языке ПОЛУЧАТЕЛЯ: он может отличаться от языка
 * того, кто вызвал действие, — в этом и смысл двуязычной платформы.
 */

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /** Данные для подстановки в текст и для ссылки. */
  payload: Record<string, string | number | boolean>;
  /** Путь внутри приложения без языкового префикса. */
  link: string;
  /** Отправлять ли письмо. Мелкие события живут только в колокольчике. */
  withEmail?: boolean;
}

async function channelsFor(
  userId: string,
  type: NotificationType,
): Promise<{ inApp: boolean; email: boolean }> {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { inApp: true, email: true },
  });

  return preference ?? { inApp: true, email: true };
}

export async function notify(input: NotifyInput): Promise<void> {
  const channels = await channelsFor(input.userId, input.type);
  if (!channels.inApp && !channels.email) return;

  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, locale: true, status: true },
  });

  if (!recipient || recipient.status === 'banned' || recipient.status === 'deleted') return;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      payload: { ...input.payload, link: input.link } as Prisma.InputJsonValue,
    },
    select: { id: true, type: true, payload: true, createdAt: true },
  });

  if (channels.inApp) {
    try {
      await redis.publish(
        REALTIME_CHANNELS.notification,
        JSON.stringify({ userId: input.userId, type: 'notification', payload: notification }),
      );
    } catch {
      // Реалтайм не критичен: запись уже в БД.
    }
  }

  if (!channels.email || !input.withEmail) return;

  const locale = recipient.locale as Locale;
  const t = getEmailTranslator(locale);
  const values = Object.fromEntries(
    Object.entries(input.payload).map(([key, value]) => [key, String(value)]),
  );

  try {
    await sendNotificationEmail(recipient.email, locale, {
      subject: t(`notifications.${input.type}.title`, values),
      heading: t(`notifications.${input.type}.title`, values),
      body: t(`notifications.${input.type}.body`, values),
      actionLabel: t(`notifications.${input.type}.action`),
      actionUrl: absoluteUrl(`/${locale}${input.link}`),
    });

    await prisma.notification.update({
      where: { id: notification.id },
      data: { emailSentAt: new Date() },
    });
  } catch (error) {
    console.error('[notifications] письмо не ушло', error);
  }
}

export async function listNotifications(userId: string, limit = 30) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
  });
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

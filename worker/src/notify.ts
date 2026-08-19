import { Redis } from 'ioredis';

import { prisma, type Prisma } from '@polyforge/db';
import { createMailer, getEmailTranslator, type Mailer } from '@polyforge/mail';
import { REALTIME_CHANNELS, type Locale, type NotificationType } from '@polyforge/shared';
import {
  createTelegramProvider,
  escapeHtml,
  type TelegramProvider,
} from '@polyforge/telegram';
import { createWebPushProvider, type WebPushProvider } from '@polyforge/webpush';

/**
 * Уведомления из воркера (§4.7).
 *
 * Логика та же, что в приложении: запись в БД, публикация для ws, пуши,
 * Telegram и письмо по настройкам подписки. Отдельная копия здесь, а не
 * импорт из app, потому что модули приложения помечены `server-only` и
 * завязаны на контекст запроса.
 */

let publisher: Redis | null = null;
let mailer: Mailer | null = null;

function redisPublisher(): Redis {
  publisher ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  return publisher;
}

let telegram: TelegramProvider | null = null;

function getTelegram(): TelegramProvider {
  telegram ??= createTelegramProvider(process.env.TELEGRAM_BOT_TOKEN ?? '');
  return telegram;
}

let webPush: WebPushProvider | null = null;

function getWebPush(): WebPushProvider {
  webPush ??= createWebPushProvider(
    process.env.WEB_PUSH_PUBLIC_KEY ?? '',
    process.env.WEB_PUSH_PRIVATE_KEY ?? '',
    process.env.WEB_PUSH_SUBJECT ?? 'mailto:hello@polyforge.local',
  );
  return webPush;
}

/**
 * Флаг канала читается из той же таблицы настроек, что и в приложении.
 * Воркеру недоступен кэш `@/server/settings` (он помечен server-only),
 * поэтому здесь прямой запрос — задачи и так ходят в базу.
 */
async function featureEnabled(key: 'feature_telegram' | 'feature_pwa'): Promise<boolean> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  return setting?.value === true;
}

function getMailer(): Mailer {
  mailer ??= createMailer({
    transport: process.env.EMAIL_TRANSPORT === 'resend' ? 'resend' : 'console',
    apiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.EMAIL_FROM ?? 'PolyForge <noreply@example.com>',
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });
  return mailer;
}

export interface WorkerNotifyInput {
  userId: string;
  type: NotificationType;
  payload: Record<string, string | number | boolean>;
  link: string;
  push?: boolean;
  /** Язык получателя, если он уже известен вызывающему коду. */
  locale?: Locale;
}

export async function notifyUser(input: WorkerNotifyInput): Promise<void> {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId: input.userId, type: input.type } },
    select: { inApp: true, email: true, telegram: true, webPush: true },
  });

  const channels = preference ?? { inApp: true, email: true, telegram: true, webPush: true };
  if (!channels.inApp && !channels.email && !channels.telegram && !channels.webPush) return;

  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      email: true,
      locale: true,
      status: true,
      telegramChatId: true,
      telegramNotifications: true,
    },
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
      await redisPublisher().publish(
        REALTIME_CHANNELS.notification,
        JSON.stringify({ userId: input.userId, type: 'notification', payload: notification }),
      );
    } catch {
      // Реалтайм не критичен: запись уже в БД.
    }
  }

  // Внешние каналы — только для событий, ради которых стоит отрывать
  // человека от дел: этот же признак решает и про письмо, и про Telegram.
  if (!input.push) return;

  const locale = (input.locale ?? recipient.locale) as Locale;
  const t = getEmailTranslator(locale);
  const values = Object.fromEntries(
    Object.entries(input.payload).map(([key, value]) => [key, String(value)]),
  );

  if (channels.webPush && (await featureEnabled('feature_pwa'))) {
    await sendPushes(input.userId, notification.id, {
      title: t(`notifications.${input.type}.title`, values),
      body: t(`notifications.${input.type}.body`, values),
      url: `/${locale}${input.link}`,
      tag: input.type,
    });
  }

  if (
    channels.telegram &&
    recipient.telegramChatId &&
    recipient.telegramNotifications &&
    (await featureEnabled('feature_telegram'))
  ) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

    const result = await getTelegram().sendMessage(recipient.telegramChatId, {
      text: `<b>${escapeHtml(t(`notifications.${input.type}.title`, values))}</b>\n\n${escapeHtml(
        t(`notifications.${input.type}.body`, values),
      )}`,
      actionUrl: `${appUrl}/${locale}${input.link}`,
      actionLabel: t(`notifications.${input.type}.action`),
    });

    if (result.blocked) {
      // Бот заблокирован — отвязываем чат, чтобы не долбиться в него.
      await prisma.user.update({
        where: { id: input.userId },
        data: { telegramChatId: null, telegramLinkedAt: null, telegramUsername: null },
      });
    } else if (result.ok) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { telegramSentAt: new Date() },
      });
    }
  }

  if (!channels.email) return;

  try {
    await getMailer().send(recipient.email, locale, {
      subject: t(`notifications.${input.type}.title`, values),
      heading: t(`notifications.${input.type}.title`, values),
      body: t(`notifications.${input.type}.body`, values),
      actionLabel: t(`notifications.${input.type}.action`),
      actionUrl: `/${locale}${input.link}`,
    });

    await prisma.notification.update({
      where: { id: notification.id },
      data: { emailSentAt: new Date() },
    });
  } catch (error) {
    console.error('[worker:notify] письмо не ушло', error);
  }
}

/**
 * Пуши на все устройства получателя.
 *
 * Копия логики из приложения по той же причине, что и всё в этом файле:
 * модули app помечены server-only. Протухшие подписки удаляются здесь же —
 * иначе воркер будет ходить за одним и тем же 410 каждую минуту.
 */
async function sendPushes(
  userId: string,
  notificationId: string,
  message: { title: string; body: string; url: string; tag: string },
): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return;

  const provider = getWebPush();
  const expired: string[] = [];
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await provider.send(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        message,
      );

      if (result.ok) delivered += 1;
      else if (result.expired) expired.push(subscription.id);
    }),
  );

  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
  }

  if (delivered > 0) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { webPushSentAt: new Date() },
    });
  }
}

export async function closeNotifier(): Promise<void> {
  if (publisher) await publisher.quit().catch(() => undefined);
}

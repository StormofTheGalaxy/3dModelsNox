import { Redis } from 'ioredis';

import { prisma, type Prisma } from '@polyforge/db';
import { createMailer, getEmailTranslator, type Mailer } from '@polyforge/mail';
import { REALTIME_CHANNELS, type Locale, type NotificationType } from '@polyforge/shared';

/**
 * Уведомления из воркера (§4.7).
 *
 * Логика та же, что в приложении: запись в БД, публикация для ws и письмо
 * по настройкам подписки. Отдельная копия здесь, а не импорт из app, потому
 * что модули приложения помечены `server-only` и завязаны на контекст запроса.
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
  withEmail?: boolean;
  /** Язык получателя, если он уже известен вызывающему коду. */
  locale?: Locale;
}

export async function notifyUser(input: WorkerNotifyInput): Promise<void> {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId: input.userId, type: input.type } },
    select: { inApp: true, email: true },
  });

  const channels = preference ?? { inApp: true, email: true };
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
      await redisPublisher().publish(
        REALTIME_CHANNELS.notification,
        JSON.stringify({ userId: input.userId, type: 'notification', payload: notification }),
      );
    } catch {
      // Реалтайм не критичен: запись уже в БД.
    }
  }

  if (!channels.email || !input.withEmail) return;

  const locale = (input.locale ?? recipient.locale) as Locale;
  const t = getEmailTranslator(locale);
  const values = Object.fromEntries(
    Object.entries(input.payload).map(([key, value]) => [key, String(value)]),
  );

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

export async function closeNotifier(): Promise<void> {
  if (publisher) await publisher.quit().catch(() => undefined);
}

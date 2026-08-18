import { prisma } from '@polyforge/db';
import { createMailer, type Mailer } from '@polyforge/mail';
import type { Locale } from '@polyforge/shared';

/**
 * Ручная рассылка сегменту (§4.10).
 *
 * Прогресс пишется в саму запись после каждой пачки: админ должен видеть,
 * докуда дошло, а упавшая на середине рассылка — не начинаться заново.
 */

let mailer: Mailer | null = null;

function getMailer(): Mailer {
  mailer ??= createMailer({
    transport: process.env.EMAIL_TRANSPORT === 'resend' ? 'resend' : 'console',
    apiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.EMAIL_FROM ?? 'PolyForge <noreply@example.com>',
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });
  return mailer;
}

export interface BroadcastPayload {
  broadcastId: string;
}

interface Recipient {
  email: string;
  locale: Locale;
}

async function recipientsFor(
  segment: string,
  locale: Locale | null,
): Promise<Recipient[]> {
  if (segment === 'waitlist') {
    const entries = await prisma.waitlistEntry.findMany({
      where: { invitedAt: null, ...(locale ? { locale } : {}) },
      select: { email: true, locale: true },
      take: 5000,
    });
    return entries.map((entry) => ({ email: entry.email, locale: entry.locale as Locale }));
  }

  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      emailVerifiedAt: { not: null },
      ...(locale ? { locale } : {}),
      ...(segment === 'designers' ? { designerProfile: { isNot: null } } : {}),
      ...(segment === 'customers' ? { customerProfile: { isNot: null } } : {}),
    },
    select: { email: true, locale: true },
    take: 5000,
  });

  return users.map((user) => ({ email: user.email, locale: user.locale as Locale }));
}

export async function sendBroadcast(payload: BroadcastPayload): Promise<number> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: payload.broadcastId },
    select: { id: true, segment: true, locale: true, subject: true, body: true, status: true },
  });

  // Повторный запуск уже отправленной рассылки не должен слать письма второй раз.
  if (!broadcast || broadcast.status !== 'draft') return 0;

  const recipients = await recipientsFor(broadcast.segment, broadcast.locale as Locale | null);

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: { status: 'sending', total: recipients.length, startedAt: new Date() },
  });

  let sent = 0;

  for (const recipient of recipients) {
    try {
      await getMailer().send(recipient.email, recipient.locale, {
        subject: broadcast.subject,
        heading: broadcast.subject,
        body: broadcast.body,
        actionLabel: 'PolyForge',
        actionUrl: `/${recipient.locale}`,
      });

      sent += 1;
    } catch (error) {
      // Один плохой адрес не должен останавливать рассылку целиком.
      console.error('[worker:broadcast] письмо не ушло', error);
    }

    if (sent % 25 === 0) {
      await prisma.broadcast.update({ where: { id: broadcast.id }, data: { sent } });
    }
  }

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: { status: 'sent', sent, finishedAt: new Date() },
  });

  return sent;
}

import { prisma } from '@polyforge/db';
import { createMailer, getEmailTranslator, type Mailer } from '@polyforge/mail';
import type { Locale } from '@polyforge/shared';

/**
 * Еженедельный email-дайджест (§4.7, фаза 6).
 *
 * Одно письмо в неделю вместо потока уведомлений: что произошло у человека
 * и что появилось интересного. Отправляется только тем, у кого действительно
 * есть о чём рассказать, — пустой дайджест это спам.
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

interface DigestNumbers {
  newOrders: number;
  unreadMessages: number;
  activeDeals: number;
  pendingReviews: number;
  newResponses: number;
}

/** Есть ли о чём писать: пустое письмо не отправляется. */
function worthSending(numbers: DigestNumbers): boolean {
  return (
    numbers.unreadMessages > 0 ||
    numbers.pendingReviews > 0 ||
    numbers.newResponses > 0 ||
    (numbers.activeDeals > 0 && numbers.newOrders > 0)
  );
}

export async function sendWeeklyDigests(): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000);

  const recipients = await prisma.user.findMany({
    where: {
      status: 'active',
      emailVerifiedAt: { not: null },
      // Дайджест — это письмо; тем, кто отключил почту по системным
      // уведомлениям, он не уходит.
      notificationPrefs: { none: { type: 'system', email: false } },
    },
    select: {
      id: true,
      email: true,
      locale: true,
      nickname: true,
      designerProfile: { select: { specializations: true } },
    },
    take: 5000,
  });

  let sent = 0;

  for (const user of recipients) {
    const [unreadAsCustomer, unreadAsDesigner, activeDeals, pendingReviews, newResponses, newOrders] =
      await Promise.all([
        prisma.dealMessage.count({
          where: {
            kind: 'user',
            readByCustomerAt: null,
            authorId: { not: user.id },
            deal: { customerId: user.id },
          },
        }),
        prisma.dealMessage.count({
          where: {
            kind: 'user',
            readByDesignerAt: null,
            authorId: { not: user.id },
            deal: { designerId: user.id },
          },
        }),
        prisma.deal.count({
          where: {
            status: { in: ['active', 'plan_agreement'] },
            OR: [{ customerId: user.id }, { designerId: user.id }],
          },
        }),
        // Завершённые сделки, где человек ещё не оставил отзыв.
        prisma.deal.count({
          where: {
            status: 'completed',
            completedAt: { gte: since },
            OR: [{ customerId: user.id }, { designerId: user.id }],
            reviews: { none: { authorId: user.id } },
          },
        }),
        prisma.orderResponse.count({
          where: { createdAt: { gte: since }, order: { customerId: user.id }, viewedAt: null },
        }),
        prisma.order.count({
          where: {
            status: 'published',
            publishedAt: { gte: since },
            customerId: { not: user.id },
            ...(user.designerProfile && user.designerProfile.specializations.length > 0
              ? { assetType: { not: null } }
              : {}),
          },
        }),
      ]);

    const numbers: DigestNumbers = {
      newOrders,
      unreadMessages: unreadAsCustomer + unreadAsDesigner,
      activeDeals,
      pendingReviews,
      newResponses,
    };

    if (!worthSending(numbers)) continue;

    const locale = user.locale as Locale;
    const t = getEmailTranslator(locale);

    const lines = [
      numbers.unreadMessages > 0
        ? t('emails.digest.messages', { count: String(numbers.unreadMessages) })
        : null,
      numbers.newResponses > 0
        ? t('emails.digest.responses', { count: String(numbers.newResponses) })
        : null,
      numbers.pendingReviews > 0
        ? t('emails.digest.reviews', { count: String(numbers.pendingReviews) })
        : null,
      numbers.newOrders > 0 ? t('emails.digest.orders', { count: String(numbers.newOrders) }) : null,
    ].filter((line): line is string => line !== null);

    try {
      await getMailer().send(user.email, locale, {
        subject: t('emails.digest.subject'),
        heading: t('emails.digest.heading', { nickname: user.nickname }),
        body: lines.join('\n'),
        actionLabel: t('emails.digest.action'),
        actionUrl: `/${locale}/dashboard`,
      });

      sent += 1;
    } catch (error) {
      console.error('[worker:digest] письмо не ушло', error);
    }
  }

  return sent;
}

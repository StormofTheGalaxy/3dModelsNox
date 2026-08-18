import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BriefContent } from '@/components/briefs/brief-content';
import { DealPanel } from '@/components/deals/deal-panel';
import { redirectToLogin } from '@/server/auth/redirects';
import { getCurrentUser, isStaff } from '@/server/auth/session';
import {
  dealBriefSections,
  getDealForUser,
  listDealMessages,
  listMilestoneDeliveries,
  listMilestonePayments,
  sourcesUnlocked,
} from '@/server/deals';
import { prisma } from '@polyforge/db';

import { getOwnReview, getReviewAbout } from '@/server/reviews';
import { getSetting } from '@/server/settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const user = await getCurrentUser();
  if (!user) return {};

  const access = await getDealForUser(id, user.id, isStaff(user));
  if (!access) return {};

  const t = await getTranslations({ locale, namespace: 'deals' });
  return { title: `${t('title')} · ${access.deal.title}` };
}

/**
 * Панель сделки (§4.6): ТЗ, этапы, файлы, чеки, чат и история — на одном
 * экране. На мобильном те же разделы разложены во вкладки.
 */
export default async function DealPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirectToLogin(locale, `/${locale}/deals/${id}`);

  const access = await getDealForUser(id, user.id, isStaff(user));
  if (!access) notFound();

  const { deal, role } = access;

  const [messages, changeRequests] = await Promise.all([
    listDealMessages(deal.id),
    prisma.briefChangeRequest.findMany({
      where: { dealId: deal.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        description: true,
        status: true,
        authorId: true,
        createdAt: true,
        author: { select: { nickname: true } },
      },
    }),
  ]);

  // Сдачи и чеки грузим сразу для всех этапов: их немного, а вкладки должны
  // переключаться без похода на сервер.
  const milestoneDetails = await Promise.all(
    deal.milestones.map(async (milestone) => ({
      milestoneId: milestone.id,
      deliveries: await listMilestoneDeliveries(milestone.id),
      payments: await listMilestonePayments(milestone.id),
    })),
  );

  // Отзывы показываются только на закрытой сделке: раньше их не с чего писать.
  const [ownReview, reviewAboutMe, blindDays] = await Promise.all([
    deal.status === 'completed' && role !== 'staff'
      ? getOwnReview(deal.id, user.id)
      : Promise.resolve(null),
    deal.status === 'completed' && role !== 'staff'
      ? getReviewAbout(deal.id, user.id)
      : Promise.resolve(null),
    getSetting('review_blind_days'),
  ]);

  return (
    <DealPanel
      locale={locale}
      role={role}
      viewerId={user.id}
      deal={{
        id: deal.id,
        title: deal.title,
        price: deal.price,
        currency: deal.currency,
        status: deal.status,
        revisionRoundsIncluded: deal.revisionRoundsIncluded,
        portfolioAllowed: deal.portfolioAllowed,
        pauseReason: deal.pauseReason,
        planConfirmedByCustomer: Boolean(deal.planConfirmedByCustomerAt),
        planConfirmedByDesigner: Boolean(deal.planConfirmedByDesignerAt),
        customerNickname: deal.customer.nickname,
        designerNickname: deal.designer.nickname,
        dispute: deal.dispute,
        orderId: deal.orderId,
      }}
      briefSlot={<BriefContent sections={dealBriefSections(deal)} />}
      briefTitle={deal.briefVersion.title}
      briefVersion={deal.briefVersion.version}
      milestones={deal.milestones.map((milestone) => ({
        ...milestone,
        dueDate: milestone.dueDate ? milestone.dueDate.toISOString() : null,
      }))}
      details={milestoneDetails}
      messages={messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
        systemPayload: (message.systemPayload ?? {}) as Record<string, string | number>,
      }))}
      changeRequests={changeRequests.map((request) => ({
        ...request,
        createdAt: request.createdAt.toISOString(),
      }))}
      sourcesUnlocked={sourcesUnlocked(deal.milestones)}
      review={{
        blindDays,
        targetRole: role === 'customer' ? 'designer' : 'customer',
        targetNickname: role === 'customer' ? deal.designer.nickname : deal.customer.nickname,
        own: ownReview
          ? { ...ownReview, editableUntil: ownReview.editableUntil.toISOString() }
          : null,
        aboutMe: reviewAboutMe
          ? {
              id: reviewAboutMe.id,
              overall: reviewAboutMe.overall,
              sub1: reviewAboutMe.sub1,
              sub2: reviewAboutMe.sub2,
              sub3: reviewAboutMe.sub3,
              text: reviewAboutMe.text,
              reply: reviewAboutMe.reply,
              targetRole: reviewAboutMe.targetRole,
              publishedAt: reviewAboutMe.publishedAt?.toISOString() ?? null,
              author: reviewAboutMe.author
                ? { id: reviewAboutMe.author.id, nickname: reviewAboutMe.author.nickname }
                : null,
            }
          : null,
      }}
    />
  );
}

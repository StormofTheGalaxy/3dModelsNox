import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArbiterPanel } from '@/components/deals/arbiter-panel';
import { Link } from '@/i18n/navigation';
import { getCurrentUser, isStaff } from '@/server/auth/session';
import { listDealMessages } from '@/server/deals';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Разбор спора (§4.6): материал целиком плюс кнопка ИИ-саммари и вердикт.
 * Арбитр видит переписку и историю этапов — деньгами он не распоряжается.
 */
export default async function DisputePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!isStaff(user)) notFound();

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    select: {
      id: true,
      reason: true,
      status: true,
      verdict: true,
      aiSummary: true,
      resolutionNote: true,
      createdAt: true,
      openedBy: { select: { nickname: true } },
      deal: {
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          customer: { select: { nickname: true } },
          designer: { select: { nickname: true } },
          milestones: {
            orderBy: { position: 'asc' },
            select: { position: true, title: true, amount: true, status: true, wasLate: true },
          },
        },
      },
    },
  });

  if (!dispute) notFound();

  const [messages, t, tDeals] = await Promise.all([
    listDealMessages(dispute.deal.id),
    getTranslations('disputes'),
    getTranslations('deals'),
  ]);

  // Вердикт лежит в payload ключом перечисления — арбитр читает его словом.
  const systemValues = (payload: unknown): Record<string, string | number> => {
    const values = (payload ?? {}) as Record<string, string | number>;
    return typeof values.verdict === 'string'
      ? { ...values, verdict: t(`verdicts.${values.verdict}`) }
      : values;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{dispute.deal.title}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {tDeals('parties', {
              customer: dispute.deal.customer.nickname,
              designer: dispute.deal.designer.nickname,
            })}{' '}
            · {dispute.deal.price.toLocaleString(locale)} {dispute.deal.currency}
          </p>
        </div>
        <Badge variant={dispute.status === 'open' ? 'danger' : 'success'}>
          {t(`status.${dispute.status}`)}
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-2 font-bold">{t('reason')}</h2>
            <p className="text-sm text-fg-muted">
              {dispute.openedBy.nickname} · {formatDate(dispute.createdAt, locale)}
            </p>
            <p className="mt-2 text-sm whitespace-pre-line">{dispute.reason}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 font-bold">{t('milestones')}</h2>
            <ul className="flex flex-col gap-2">
              {dispute.deal.milestones.map((milestone) => (
                <li key={milestone.position} className="flex justify-between gap-3 text-sm">
                  <span>
                    {milestone.position}. {milestone.title}
                  </span>
                  <span className="text-fg-muted">
                    {milestone.amount.toLocaleString(locale)} {dispute.deal.currency} ·{' '}
                    {tDeals(`milestones.status.${milestone.status}`)}
                    {milestone.wasLate ? ` · ${t('late')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <ArbiterPanel
          disputeId={dispute.id}
          status={dispute.status}
          verdict={dispute.verdict}
          aiSummary={dispute.aiSummary}
          resolutionNote={dispute.resolutionNote}
        />

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 font-bold">{t('conversation')}</h2>
            <ol className="flex flex-col gap-3">
              {messages.map((message) => (
                <li key={message.id} className="text-sm">
                  <span className="text-xs text-fg-muted">
                    {message.author?.nickname ?? t('systemAuthor')} ·{' '}
                    {formatDate(message.createdAt, locale)}
                  </span>
                  <p className="whitespace-pre-line">
                    {message.kind === 'system' && message.systemKey
                      ? tDeals(`system.${message.systemKey}`, systemValues(message.systemPayload))
                      : message.text}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Link href={`/deals/${dispute.deal.id}`} className="text-sm text-accent hover:underline">
          {t('openDeal')}
        </Link>
      </div>
    </div>
  );
}

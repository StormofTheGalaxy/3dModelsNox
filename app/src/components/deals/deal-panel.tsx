'use client';

import { FileText, Files, History, MessageSquare, Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import type { DealStatus, MilestoneStatus } from '@polyforge/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DealActions } from '@/components/deals/deal-actions';
import { DealChat } from '@/components/deals/deal-chat';
import { DealHistory } from '@/components/deals/deal-history';
import { DealFiles } from '@/components/deals/deal-files';
import { DealReceipts } from '@/components/deals/deal-receipts';
import { MilestonePlan } from '@/components/deals/milestone-plan';
import { MilestoneTimeline } from '@/components/deals/milestone-timeline';
import { DEAL_STATUS_TONE } from '@/components/deals/status';
import { ReviewForm } from '@/components/reviews/review-form';
import { ReviewList, type ReviewView } from '@/components/reviews/review-list';
import { cn } from '@/lib/utils';
import type {
  DealChangeRequest,
  DealMessageView,
  DealSummary,
  MilestoneDetails,
  MilestoneView,
} from '@/components/deals/types';

/**
 * Панель сделки (§4.6).
 *
 * Один экран: слева этапы и действия, справа — вкладки ТЗ / Файлы / Чеки /
 * Чат / История. На мобильном колонки складываются, вкладки остаются теми же:
 * приёмка сделки должна проходить с телефона (§7, критерий приёмки фазы).
 */

const TABS = [
  { key: 'brief', icon: FileText },
  { key: 'files', icon: Files },
  { key: 'receipts', icon: Receipt },
  { key: 'chat', icon: MessageSquare },
  { key: 'history', icon: History },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function DealPanel({
  locale,
  role,
  viewerId,
  deal,
  briefSlot,
  briefTitle,
  briefVersion,
  milestones,
  details,
  messages,
  changeRequests,
  sourcesUnlocked,
  translation,
  review,
}: {
  locale: string;
  role: 'customer' | 'designer' | 'staff';
  viewerId: string;
  deal: DealSummary;
  briefSlot: ReactNode;
  briefTitle: string;
  briefVersion: number;
  milestones: MilestoneView[];
  details: MilestoneDetails[];
  messages: DealMessageView[];
  changeRequests: DealChangeRequest[];
  sourcesUnlocked: boolean;
  /** Настройка автоперевода читателя и уже посчитанные переводы (§4.7). */
  translation: { incoming: boolean; cached: Record<string, string> };
  review: {
    blindDays: number;
    targetRole: 'designer' | 'customer';
    targetNickname: string;
    own: {
      id: string;
      overall: number;
      sub1: number;
      sub2: number;
      sub3: number;
      text: string;
      status: string;
      editableUntil: string;
    } | null;
    aboutMe: ReviewView | null;
  };
}) {
  const t = useTranslations('deals');
  const [tab, setTab] = useState<TabKey>('brief');

  const paid = milestones
    .filter((milestone) => milestone.status === ('paid_confirmed' satisfies MilestoneStatus))
    .reduce((sum, milestone) => sum + milestone.amount, 0);
  const percent = deal.price === 0 ? 0 : Math.round((paid / deal.price) * 100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{deal.title}</h1>
          <Badge variant={DEAL_STATUS_TONE[deal.status as DealStatus]}>
            {t(`status.${deal.status}`)}
          </Badge>
        </div>

        <p className="text-sm text-fg-muted">
          {t('parties', {
            customer: deal.customerNickname,
            designer: deal.designerNickname,
          })}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="h-2 w-full min-w-0 flex-1 basis-40 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('progress')}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-sm">
            {t('paidOf', {
              paid: paid.toLocaleString(locale),
              total: deal.price.toLocaleString(locale),
              currency: deal.currency,
            })}
          </span>
        </div>

        {/* Платформа не проводит деньги — об этом честно сказано на самом
            экране, где стороны рассчитываются (§1.2, §4.10). */}
        <p className="rounded-[var(--radius-card)] bg-surface-2 px-4 py-3 text-xs text-fg-muted">
          {t('paymentDisclaimer')}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* min-w-0 обязателен: без него колонка грида растягивается по самому
            широкому потомку и страница едет вбок на телефоне.

            Колонка липкая на широком экране: этапы и управление сделкой нужны
            под рукой, пока читаешь ТЗ или листаешь чат в правой колонке. */}
        <section className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          {deal.status === 'plan_agreement' && role !== 'staff' ? (
            <MilestonePlan
              dealId={deal.id}
              role={role}
              price={deal.price}
              currency={deal.currency}
              milestones={milestones}
              confirmedByCustomer={deal.planConfirmedByCustomer}
              confirmedByDesigner={deal.planConfirmedByDesigner}
            />
          ) : (
            <MilestoneTimeline
              locale={locale}
              role={role}
              deal={deal}
              milestones={milestones}
              details={details}
              sourcesUnlocked={sourcesUnlocked}
            />
          )}

          <DealActions role={role} deal={deal} changeRequests={changeRequests} viewerId={viewerId} />

          {deal.status === 'completed' && role !== 'staff' ? (
            <>
              <ReviewForm
                dealId={deal.id}
                targetRole={review.targetRole}
                targetNickname={review.targetNickname}
                blindDays={review.blindDays}
                existing={review.own}
              />

              {review.aboutMe ? (
                <Card>
                  <CardContent className="flex flex-col gap-3 p-5">
                    <h2 className="text-lg font-bold">{t('reviewAboutYou')}</h2>
                    <ReviewList
                      reviews={[review.aboutMe]}
                      locale={locale}
                      canReplyAs={review.aboutMe.reply ? null : viewerId}
                    />
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <nav
            className="flex gap-1 overflow-x-auto rounded-[var(--radius-card)] bg-surface-2 p-1"
            aria-label={t('tabsLabel')}
          >
            {TABS.map((entry) => {
              const Icon = entry.icon;
              const active = tab === entry.key;

              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setTab(entry.key)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius-card)-0.25rem)] px-3 py-2 text-sm whitespace-nowrap transition-colors',
                    active ? 'bg-surface font-medium text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {t(`tabs.${entry.key}`)}
                </button>
              );
            })}
          </nav>

          <Card>
            <CardContent className="p-5">
              {tab === 'brief' ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-fg-muted">
                    {t('briefFrozen', { title: briefTitle, version: briefVersion })}
                  </p>
                  {briefSlot}
                </div>
              ) : null}

              {tab === 'files' ? (
                <DealFiles
                  details={details}
                  milestones={milestones}
                  sourcesUnlocked={sourcesUnlocked}
                  role={role}
                />
              ) : null}

              {tab === 'receipts' ? (
                <DealReceipts locale={locale} details={details} milestones={milestones} />
              ) : null}

              {tab === 'chat' ? (
                <DealChat
                  dealId={deal.id}
                  viewerId={viewerId}
                  locale={locale}
                  initialMessages={messages}
                  readOnly={role === 'staff'}
                  translateIncoming={translation.incoming}
                  cachedTranslations={translation.cached}
                />
              ) : null}

              {tab === 'history' ? <DealHistory locale={locale} messages={messages} /> : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

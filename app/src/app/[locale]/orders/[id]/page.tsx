import type { Metadata } from 'next';
import { CalendarDays, FileText, Lock, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { parseBriefSections, type Locale } from '@polyforge/shared';

import { Link } from '@/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BriefContent } from '@/components/briefs/brief-content';
import { TranslatedText } from '@/components/translation/translated-text';
import { OrderOwnerActions } from '@/components/orders/order-owner-actions';
import { ResponseForm } from '@/components/orders/response-form';
import { ReportDialog } from '@/components/report/report-dialog';
import { getCurrentUser } from '@/server/auth/session';
import { getOrder } from '@/server/orders';
import { getProfileState } from '@/server/profiles';
import { translateField } from '@/server/translation';
import { getOwnResponse, responsesLeftToday } from '@/server/responses';
import { listDesignerWorks } from '@/server/works';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return {};

  return { title: order.title };
}

const COMPETITION_TONE = { low: 'success', medium: 'warning', high: 'danger' } as const;

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [order, viewer] = await Promise.all([getOrder(id), getCurrentUser()]);
  if (!order) notFound();

  const [t, tTax] = await Promise.all([getTranslations('orders'), getTranslations('taxonomy')]);

  // Автоперевод контента (§4.7): заказ читается на языке интерфейса зрителя.
  // Гостю не переводим — за это списываются кредиты, а платить за анонимов
  // платформе незачем.
  const title =
    viewer?.translateContent && viewer.id !== order.customerId
      ? await translateField({
          entity: 'order',
          entityId: order.id,
          field: 'title',
          text: order.title,
          targetLocale: locale as Locale,
          viewerId: viewer.id,
        })
      : { text: order.title, original: order.title, translated: false };

  const isOwner = viewer?.id === order.customerId;
  const competition =
    order.responsesCount <= 3 ? 'low' : order.responsesCount <= 10 ? 'medium' : 'high';

  const budget =
    order.budgetMode === 'fixed' && order.budgetAmount !== null
      ? `${order.budgetAmount.toLocaleString(locale)} ${order.budgetCurrency}`
      : t('budgetOpen');

  // Гостю показываем тизер: полные условия и отклик — после входа (§4.11).
  const isGuest = !viewer;

  const profileState = viewer ? await getProfileState(viewer.id) : null;
  const canRespond =
    Boolean(viewer?.emailVerifiedAt) &&
    !isOwner &&
    order.status === 'published' &&
    Boolean(profileState?.hasDesigner);

  const [ownResponse, works, quota] = await Promise.all([
    viewer && !isOwner ? getOwnResponse(order.id, viewer.id) : Promise.resolve(null),
    canRespond && viewer ? listDesignerWorks(viewer.id, false) : Promise.resolve([]),
    canRespond && viewer ? responsesLeftToday(viewer.id) : Promise.resolve({ left: 0, limit: 0 }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <TranslatedText
            as="h1"
            className="text-2xl font-bold sm:text-3xl"
            text={title.text}
            original={title.original}
            translated={title.translated}
          />

          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge variant={order.status === 'published' ? 'success' : 'neutral'}>
              {t(`status.${order.status}`)}
            </Badge>

            {order.assetType ? (
              <Badge variant="accent">{tTax(`assetType.${order.assetType}`)}</Badge>
            ) : null}

            {order.styles.map((style) => (
              <Badge key={style} variant="outline">
                {tTax(`style.${style}`)}
              </Badge>
            ))}

            <Link
              href={`/customers/${order.customer.nickname}`}
              className="font-medium text-fg hover:text-accent"
            >
              @{order.customer.nickname}
            </Link>

            {order.publishedAt ? (
              <span>{t('publishedAt', { date: formatDate(order.publishedAt, locale) })}</span>
            ) : null}
          </div>
        </div>

        <OrderOwnerActions orderId={order.id} canManage={isOwner && order.status === 'published'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-4">
          {isGuest ? (
            <>
              <Alert tone="info">{t('guestTeaser')}</Alert>
              <Card>
                <CardContent className="flex flex-col items-start gap-3">
                  <p className="flex items-center gap-2 text-sm text-fg-muted">
                    <Lock className="size-4" aria-hidden />
                    {t('guestTeaser')}
                  </p>
                  <Button asChild>
                    <Link href="/login">{t('guestCta')}</Link>
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <BriefContent sections={parseBriefSections(order.brief.sections)} />
          )}

          {ownResponse ? (
            <Card>
              <CardContent className="flex flex-col gap-2">
                <h2 className="font-semibold">{t('response.yours')}</h2>
                <p className="text-sm text-fg-muted">
                  {t('responses.priceAndTerm', {
                    price: ownResponse.price,
                    currency: ownResponse.currency,
                    days: ownResponse.days,
                  })}
                </p>
                <Badge variant="outline" className="w-fit">
                  {t(`responses.status.${ownResponse.status}`)}
                </Badge>
              </CardContent>
            </Card>
          ) : canRespond ? (
            works.length === 0 ? (
              <Alert tone="warning">{t('response.needWorks')}</Alert>
            ) : (
              <ResponseForm
                orderId={order.id}
                defaultCurrency={order.budgetCurrency}
                limit={quota}
                works={works.map((work) => ({
                  id: work.id,
                  title: work.title,
                  thumbnailUrl: work.media[0]?.thumbnailUrl ?? work.media[0]?.url ?? null,
                }))}
              />
            )
          ) : viewer && !isOwner && !profileState?.hasDesigner ? (
            <Alert tone="info">{t('response.needProfile')}</Alert>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-fg-muted">{t('publishForm.budget')}</span>
                <span className="font-mono font-semibold">{budget}</span>
              </div>

              <div className="flex items-baseline justify-between gap-2 border-t border-[var(--pf-border)] pt-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {t('publishForm.deadline')}
                </span>
                <span className="text-sm">
                  {order.deadline ? formatDate(order.deadline, locale) : t('noDeadline')}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2 border-t border-[var(--pf-border)] pt-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                  <Users className="size-3.5" aria-hidden />
                  {t('competition.label')}
                </span>
                {/* Точное число откликов видит только заказчик (§3). */}
                {isOwner ? (
                  <span className="font-mono text-sm">{order.responsesCount}</span>
                ) : (
                  <Badge variant={COMPETITION_TONE[competition]}>
                    {t(`competition.${competition}`)}
                  </Badge>
                )}
              </div>

              {isOwner && order.expiresAt ? (
                <p className="border-t border-[var(--pf-border)] pt-3 text-xs text-fg-muted">
                  {t('expiresAt', { date: formatDate(order.expiresAt, locale) })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {isOwner ? (
            <Button asChild variant="secondary">
              <Link href={`/orders/${order.id}/responses`}>
                {t('responses.count', { count: order.responsesCount })}
              </Link>
            </Button>
          ) : null}

          {isOwner ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/briefs/${order.briefId}`}>
                <FileText aria-hidden />
                {t('openBrief')}
              </Link>
            </Button>
          ) : null}

          {viewer && !isOwner ? <ReportDialog targetType="order" targetId={order.id} /> : null}
        </aside>
      </div>
    </div>
  );
}

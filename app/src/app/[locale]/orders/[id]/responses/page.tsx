import type { Metadata } from 'next';
import { Inbox, Star } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ResponseActions } from '@/components/orders/response-actions';
import { WorkCard } from '@/components/works/work-card';
import { requireVerifiedUser } from '@/server/auth/guards';
import { getOrder } from '@/server/orders';
import { managedOrganizationIds, managesRecord } from '@/server/organizations';
import { getAttachedWorks, listOrderResponses } from '@/server/responses';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'orders.responses' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

const STATUS_TONE = {
  new: 'accent',
  viewed: 'neutral',
  shortlist: 'success',
  rejected: 'danger',
  accepted: 'success',
} as const;

export default async function OrderResponsesPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const order = await getOrder(id);

  // Отклики видит тот, кто распоряжается заказом: сам заказчик или
  // менеджер команды, от имени которой заказ опубликован (§1.4).
  if (!order || !managesRecord(order, user.id, await managedOrganizationIds(user.id))) {
    notFound();
  }

  const [t, tTax, tDesigners, responses] = await Promise.all([
    getTranslations('orders.responses'),
    getTranslations('taxonomy'),
    getTranslations('designers'),
    listOrderResponses(order.id),
  ]);

  const works = await getAttachedWorks(responses.flatMap((response) => response.attachedWorkIds));
  const worksById = new Map(works.map((work) => [work.id, work]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-col gap-1">
        <Link href={`/orders/${order.id}`} className="text-sm text-fg-muted hover:text-fg">
          ← {order.title}
        </Link>
        <h1 className="text-2xl font-bold sm:text-3xl">
          {t('count', { count: responses.length })}
        </h1>
      </div>

      {responses.length === 0 ? (
        <EmptyState icon={Inbox} title={t('empty')} description={t('emptyHint')} />
      ) : (
        <div className="flex flex-col gap-4">
          {responses.map((response) => {
            const profile = response.designer.designerProfile;
            const attached = response.attachedWorkIds
              .map((workId) => worksById.get(workId))
              .filter((work): work is NonNullable<typeof work> => Boolean(work));

            return (
              <Card key={response.id} glow={response.isInvited}>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="size-11 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                        {profile?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <span className="pf-gradient flex size-full items-center justify-center font-bold text-white">
                            {response.designer.nickname.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </span>

                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/designers/${response.designer.nickname}`}
                          className="font-semibold hover:text-accent"
                        >
                          {response.designer.nickname}
                        </Link>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                          {profile ? tTax(`level.${profile.level}`) : null}
                          {profile && profile.ratingCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Star className="size-3 fill-current text-[var(--pf-warning)]" aria-hidden />
                              {profile.rating.toFixed(1)}
                            </span>
                          ) : null}
                          {profile ? (
                            <span>· {tDesigners('orders', { count: profile.ordersCompleted })}</span>
                          ) : null}
                          <span>· {formatDate(response.createdAt, locale)}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {response.isInvited ? <Badge variant="accent">★</Badge> : null}
                      <Badge variant={STATUS_TONE[response.status]}>
                        {t(`status.${response.status}`)}
                      </Badge>
                    </div>
                  </div>

                  <p className="font-mono text-sm font-semibold">
                    {t('priceAndTerm', {
                      price: response.price,
                      currency: response.currency,
                      days: response.days,
                    })}
                  </p>

                  <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
                    {response.coverText}
                  </p>

                  {attached.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {attached.map((work) => (
                        <WorkCard
                          key={work.id}
                          work={{
                            id: work.id,
                            title: work.title,
                            likesCount: work.likesCount,
                            views: work.views,
                            badgeOnPlatform: work.badgeOnPlatform,
                            designer: { nickname: work.designer.nickname },
                            media: work.media,
                          }}
                        />
                      ))}
                    </div>
                  ) : null}

                  {response.rejectReason ? (
                    <p className="text-xs text-fg-muted">
                      {t(`reasons.${response.rejectReason}`)}
                    </p>
                  ) : null}

                  <ResponseActions responseId={response.id} status={response.status} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

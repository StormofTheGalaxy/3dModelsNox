import type { Metadata } from 'next';
import { Handshake } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { dealProgress, listUserDeals } from '@/server/deals';
import { DEAL_STATUS_TONE } from '@/components/deals/status';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'deals' });
  return { title: t('title') };
}

/** Список сделок пользователя: он же и заказчик, и дизайнер — фильтра ролей нет. */
export default async function DealsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [deals, t] = await Promise.all([listUserDeals(user.id), getTranslations('deals')]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">{t('title')}</h1>

      {deals.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {deals.map((deal) => {
            const progress = dealProgress(deal.milestones);
            const role = deal.customerId === user.id ? 'customer' : 'designer';
            const other = role === 'customer' ? deal.designer.nickname : deal.customer.nickname;

            return (
              <li key={deal.id}>
                <Card glow>
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link href={`/deals/${deal.id}`} className="font-semibold hover:text-accent">
                        {deal.title}
                      </Link>
                      <Badge variant={DEAL_STATUS_TONE[deal.status]}>
                        {t(`status.${deal.status}`)}
                      </Badge>
                    </div>

                    <p className="text-sm text-fg-muted">
                      {t(`role.${role}`)} · {other} · {formatDate(deal.createdAt, locale)}
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                      <div
                        className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-surface-2"
                        role="progressbar"
                        aria-valuenow={progress.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-300"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                      <span className="text-sm whitespace-nowrap text-fg-muted">
                        {progress.paid.toLocaleString(locale)} / {deal.price.toLocaleString(locale)}{' '}
                        {deal.currency}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

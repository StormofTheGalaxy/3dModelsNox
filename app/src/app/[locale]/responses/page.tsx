import type { Metadata } from 'next';
import { Send } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireVerifiedUser } from '@/server/auth/guards';
import { listDesignerResponses } from '@/server/responses';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'orders.responses' });
  return { title: t('mine'), robots: { index: false, follow: false } };
}

const STATUS_TONE = {
  new: 'accent',
  viewed: 'neutral',
  shortlist: 'success',
  rejected: 'danger',
  accepted: 'success',
} as const;

export default async function MyResponsesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, tOrders, responses] = await Promise.all([
    getTranslations('orders.responses'),
    getTranslations('orders'),
    listDesignerResponses(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold sm:text-3xl">{t('mine')}</h1>

      {responses.length === 0 ? (
        <EmptyState
          icon={Send}
          title={t('myEmpty')}
          description={tOrders('boardHint')}
          action={
            <Button asChild>
              <Link href="/orders">{tOrders('board')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {responses.map((response) => (
            <Card key={response.id} glow>
              <CardContent className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    href={`/orders/${response.order.id}`}
                    className="truncate font-semibold hover:text-accent"
                  >
                    {response.order.title}
                  </Link>

                  <span className="font-mono text-xs text-fg-muted">
                    {t('priceAndTerm', {
                      price: response.price,
                      currency: response.currency,
                      days: response.days,
                    })}
                    {' · '}
                    {formatDate(response.createdAt, locale)}
                  </span>

                  {/* Шаблонная причина отказа видна дизайнеру (§3). */}
                  {response.rejectReason ? (
                    <span className="text-xs text-fg-muted">
                      {t(`reasons.${response.rejectReason}`)}
                    </span>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge variant={STATUS_TONE[response.status]}>
                    {t(`status.${response.status}`)}
                  </Badge>
                  {response.isInvited ? (
                    <Badge variant="accent">{tOrders('invitedBadge')}</Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

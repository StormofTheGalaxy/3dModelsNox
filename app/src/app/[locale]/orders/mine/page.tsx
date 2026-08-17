import type { Metadata } from 'next';
import { ClipboardList, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireVerifiedUser } from '@/server/auth/guards';
import { listCustomerOrders } from '@/server/orders';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'orders' });
  return { title: t('mine'), robots: { index: false, follow: false } };
}

const STATUS_TONE = {
  draft: 'neutral',
  published: 'success',
  in_progress: 'accent',
  completed: 'success',
  cancelled: 'neutral',
  archived: 'outline',
} as const;

export default async function MyOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, orders] = await Promise.all([getTranslations('orders'), listCustomerOrders(user.id)]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('mine')}</h1>
        <Button asChild size="sm">
          <Link href="/orders/new">
            <Plus aria-hidden />
            {t('publish')}
          </Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('emptyMine')}
          description={t('emptyMineHint')}
          action={
            <Button asChild>
              <Link href="/orders/new">{t('publish')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Card key={order.id} glow>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/orders/${order.id}`} className="truncate font-semibold hover:text-accent">
                    {order.title}
                  </Link>
                  <span className="text-xs text-fg-muted">
                    {order.publishedAt ? formatDate(order.publishedAt, locale) : null}
                    {order.budgetMode === 'fixed' && order.budgetAmount
                      ? ` · ${order.budgetAmount} ${order.budgetCurrency}`
                      : ` · ${t('budgetOpen')}`}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_TONE[order.status]}>{t(`status.${order.status}`)}</Badge>

                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/orders/${order.id}/responses`}>
                      {t('responses.count', { count: order.responsesCount })}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma, type Prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { UnpublishOrderButton } from '@/components/admin/unpublish-order-button';
import { Link } from '@/i18n/navigation';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

/** Заказы и ТЗ (§4.10): просмотр и снятие с витрины. */
export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const search = (query.q ?? '').trim().slice(0, 100);

  const where: Prisma.OrderWhereInput = search
    ? { title: { contains: search, mode: 'insensitive' } }
    : {};

  const [orders, t] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        responsesCount: true,
        budgetAmount: true,
        budgetCurrency: true,
        customer: { select: { nickname: true } },
      },
    }),
    getTranslations('admin'),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.orders')}</h1>

      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={search}
          placeholder={t('orders.searchPlaceholder')}
          aria-label={t('orders.searchPlaceholder')}
        />
      </form>

      {orders.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('orders.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link href={`/orders/${order.id}`} className="font-medium hover:text-accent">
                      {order.title}
                    </Link>
                    <p className="text-sm text-fg-muted">
                      {order.customer.nickname} · {formatDate(order.createdAt, locale)} ·{' '}
                      {t('orders.responses', { count: order.responsesCount })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {order.budgetAmount ? (
                      <span className="font-mono text-sm">
                        {order.budgetAmount.toLocaleString(locale)} {order.budgetCurrency}
                      </span>
                    ) : null}
                    <Badge variant={order.status === 'published' ? 'success' : 'neutral'}>
                      {order.status}
                    </Badge>
                    {order.status === 'published' ? (
                      <UnpublishOrderButton orderId={order.id} />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

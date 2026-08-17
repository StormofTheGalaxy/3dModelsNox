import type { Metadata } from 'next';
import { Bookmark, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { orderFilterSchema } from '@polyforge/shared';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { OrderBoard } from '@/components/orders/order-board';
import { OrderFilters } from '@/components/orders/order-filters';
import { getCurrentUser } from '@/server/auth/session';
import { listOrders, listSavedFilters, toOrderCardData } from '@/server/orders';
import { getProfileState } from '@/server/profiles';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'orders' });
  return { title: t('board'), description: t('boardHint') };
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function OrdersBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  // Параметры приходят из URL — прогоняем через ту же схему, что и догрузка.
  const parsed = orderFilterSchema.safeParse({
    query: query.query || undefined,
    assetType: query.assetType || undefined,
    style: query.style || undefined,
    engine: query.engine || undefined,
    budgetMin: toNumber(query.budgetMin),
    budgetMax: toNumber(query.budgetMax),
    currency: query.currency || undefined,
    deadlineWithinDays: toNumber(query.deadlineWithinDays),
    verifiedCustomersOnly: query.verified === '1',
    noResponsesOnly: query.noResponses === '1',
    sort: query.sort || 'new',
    limit: 20,
  });

  const filter = parsed.success ? parsed.data : orderFilterSchema.parse({});

  const [t, user] = await Promise.all([getTranslations('orders'), getCurrentUser()]);
  const [orders, savedFilters, profileState] = await Promise.all([
    listOrders(filter, user?.id ?? null),
    user ? listSavedFilters(user.id) : Promise.resolve([]),
    user ? getProfileState(user.id) : Promise.resolve(null),
  ]);

  const isFiltered = Boolean(
    filter.query ||
      filter.assetType ||
      filter.style ||
      filter.engine ||
      filter.budgetMin !== undefined ||
      filter.budgetMax !== undefined ||
      filter.verifiedCustomersOnly ||
      filter.noResponsesOnly,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{t('board')}</h1>
          <p className="text-sm text-fg-muted">{t('boardHint')}</p>
        </div>

        {profileState?.hasCustomer ? (
          <Button asChild size="sm">
            <Link href="/orders/new">
              <Plus aria-hidden />
              {t('publish')}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mb-7">
        <OrderFilters canSave={Boolean(user)} />
      </div>

      {savedFilters.length > 0 ? (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Bookmark className="size-4 text-accent" aria-hidden />
              {t('savedFilters.title')}
            </span>

            {savedFilters.map((saved) => (
              <Badge key={saved.id} variant="outline">
                {saved.title}
                {saved.notifyEmail ? ' · @' : ''}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <OrderBoard
        key={JSON.stringify(filter)}
        initialItems={orders.items.map(toOrderCardData)}
        initialCursor={orders.nextCursor}
        filters={{
          query: filter.query,
          assetType: filter.assetType,
          style: filter.style,
          engine: filter.engine,
          budgetMin: filter.budgetMin,
          budgetMax: filter.budgetMax,
          currency: filter.currency,
          deadlineWithinDays: filter.deadlineWithinDays,
          verifiedCustomersOnly: filter.verifiedCustomersOnly,
          noResponsesOnly: filter.noResponsesOnly,
          sort: filter.sort,
        }}
        isFiltered={isFiltered}
        locale={locale}
      />
    </div>
  );
}

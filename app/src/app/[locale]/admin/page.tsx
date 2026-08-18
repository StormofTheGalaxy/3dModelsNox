import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkline } from '@/components/admin/sparkline';
import { Link } from '@/i18n/navigation';
import { dashboardStats } from '@/server/admin/stats';

export const metadata: Metadata = { robots: { index: false } };

/** Дашборд админки (§4.10): регистрации, заказы, сделки, деньги, очереди. */
export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [stats, t, tDeals] = await Promise.all([
    dashboardStats(30),
    getTranslations('admin'),
    getTranslations('deals.status'),
  ]);

  const number = (value: number) => value.toLocaleString(locale);

  const tiles = [
    { label: t('stats.users'), value: number(stats.users.total), hint: t('stats.newInPeriod', { count: stats.users.newInPeriod }) },
    { label: t('stats.activeToday'), value: number(stats.users.active), hint: t('stats.banned', { count: stats.users.banned }) },
    { label: t('stats.orders'), value: number(stats.orders.published), hint: t('stats.responses', { count: stats.orders.responses }) },
    { label: t('stats.confirmed'), value: number(stats.money.confirmed), hint: t('stats.claimed', { amount: number(stats.money.claimed) }) },
  ];

  const queues = [
    { href: '/admin/reports', label: t('nav.reports'), count: stats.moderation.reports },
    { href: '/admin/verification', label: t('nav.verification'), count: stats.moderation.verifications },
    { href: '/admin/disputes', label: t('nav.disputes'), count: stats.disputes.open },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.dashboard')}</h1>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="p-4">
              <p className="text-sm text-fg-muted">{tile.label}</p>
              <p className="mt-1 font-mono text-2xl font-bold">{tile.value}</p>
              <p className="mt-1 text-xs text-fg-muted">{tile.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="mb-3 font-bold">{t('stats.registrations')}</h2>
          <Sparkline
            points={stats.registrations}
            emptyLabel={t('stats.noData')}
            locale={locale}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 font-bold">{t('stats.deals')}</h2>
            {Object.keys(stats.deals).length === 0 ? (
              <p className="text-sm text-fg-muted">{t('stats.noData')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {Object.entries(stats.deals).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between gap-3 text-sm">
                    <span>{tDeals(status)}</span>
                    <span className="font-mono">{number(count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 font-bold">{t('stats.queues')}</h2>
            <ul className="flex flex-col gap-2">
              {queues.map((queue) => (
                <li key={queue.href}>
                  <Link
                    href={queue.href}
                    className="flex items-center justify-between gap-3 text-sm hover:text-accent"
                  >
                    <span>{queue.label}</span>
                    <Badge variant={queue.count > 0 ? 'warning' : 'neutral'}>
                      {number(queue.count)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

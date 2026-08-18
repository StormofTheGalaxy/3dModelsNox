import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { attentionDeals } from '@/server/admin/stats';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Сделки, требующие внимания (§4.10): зависшие оплаты и просроченные этапы.
 *
 * Списка всех сделок здесь нет намеренно: администратору нужны те, где
 * что-то пошло не так, а не лента чужой работы.
 */
export default async function AdminDealsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [{ stuckPayments, overdue }, t] = await Promise.all([
    attentionDeals(),
    getTranslations('admin'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.deals')}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t('deals.stuck')}</h2>

        {stuckPayments.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('deals.noStuck')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stuckPayments.map((payment) => (
              <li key={payment.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Link
                        href={`/deals/${payment.milestone.deal.id}`}
                        className="font-medium hover:text-accent"
                      >
                        {payment.milestone.deal.title}
                      </Link>
                      <p className="text-sm text-fg-muted">
                        {payment.milestone.title} · {payment.milestone.deal.customer.nickname} →{' '}
                        {payment.milestone.deal.designer.nickname}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm">
                        {payment.amount.toLocaleString(locale)} {payment.currency}
                      </span>
                      <Badge variant="danger">
                        {t('deals.reminders', { count: payment.reminderCount })}
                      </Badge>
                      <span className="text-xs text-fg-muted">
                        {formatDate(payment.customerClaimedAt, locale)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t('deals.overdue')}</h2>

        {overdue.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('deals.noOverdue')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overdue.map((milestone) => (
              <li key={milestone.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Link
                        href={`/deals/${milestone.deal.id}`}
                        className="font-medium hover:text-accent"
                      >
                        {milestone.deal.title}
                      </Link>
                      <p className="text-sm text-fg-muted">
                        {milestone.title} · {milestone.deal.designer.nickname}
                      </p>
                    </div>

                    <Badge variant="warning">
                      {milestone.dueDate ? formatDate(milestone.dueDate, locale) : ''}
                    </Badge>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

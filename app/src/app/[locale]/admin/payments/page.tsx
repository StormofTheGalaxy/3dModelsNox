import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PaymentReviewActions } from '@/components/admin/payment-review-actions';
import { Link } from '@/i18n/navigation';
import {
  commissionsEnabled,
  feeTotals,
  paymentProvider,
  paymentsEnabled,
} from '@/server/payments';
import { getSetting, getSettings } from '@/server/settings';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

const CHECK_TONE = {
  none: 'neutral',
  random_ok: 'outline',
  flagged: 'danger',
  verified: 'success',
} as const;

/**
 * Лента чеков (§4.10).
 *
 * Платформа не проводит платежи и не может проверить их в банке — проверка
 * здесь означает «модератор посмотрел приложенный документ», не больше.
 */
export default async function AdminPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const filter = query.filter === 'sampled' ? 'sampled' : 'all';

  const [payments, settings, t] = await Promise.all([
    prisma.paymentConfirmation.findMany({
      where: filter === 'sampled' ? { adminCheck: { in: ['random_ok', 'flagged'] } } : {},
      orderBy: { customerClaimedAt: 'desc' },
      take: 60,
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        adminCheck: true,
        customerClaimedAt: true,
        files: { select: { id: true, fileName: true } },
        milestone: {
          select: {
            title: true,
            deal: {
              select: {
                id: true,
                title: true,
                customer: { select: { nickname: true } },
                designer: { select: { nickname: true } },
              },
            },
          },
        },
      },
    }),
    getSettings(['receipt_check_all', 'receipt_random_check_pct']),
    getTranslations('admin'),
  ]);

  // Комиссии и платёжный модуль (§1.2.2, post-MVP №11). Пока юрлица нет,
  // блок честно говорит, что удержаний не было и провайдер ручной.
  const [commissionsOn, paymentsOn, tiers, totals] = await Promise.all([
    commissionsEnabled(),
    paymentsEnabled(),
    getSetting('commission_tiers'),
    feeTotals(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.payments')}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {settings.receipt_check_all
            ? t('payments.modeAll')
            : t('payments.modeSample', { percent: settings.receipt_random_check_pct })}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t('payments.commission.title')}</h2>
            <Badge variant={commissionsOn ? 'success' : 'neutral'}>
              {t(commissionsOn ? 'payments.commission.on' : 'payments.commission.off')}
            </Badge>
          </div>

          <p className="text-sm text-fg-muted">
            {t(commissionsOn ? 'payments.commission.hintOn' : 'payments.commission.hintOff')}
          </p>

          <ul className="flex flex-wrap gap-2">
            {[...tiers]
              .sort((first, second) => first.fromDeals - second.fromDeals)
              .map((tier) => (
                <li
                  key={tier.fromDeals}
                  className="rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted"
                >
                  {t('payments.commission.tier', {
                    percent: tier.percent,
                    from: tier.fromDeals,
                  })}
                </li>
              ))}
          </ul>

          <p className="text-sm">
            {totals.length === 0
              ? t('payments.commission.noFees')
              : totals
                  .map((row) =>
                    // При выключенных комиссиях начисления — это история, и
                    // подпись не должна спорить со строкой «комиссий нет».
                    t(commissionsOn ? 'payments.commission.total' : 'payments.commission.totalPast', {
                      amount: row.total.toLocaleString(locale),
                      currency: row.currency,
                      count: row.count,
                    }),
                  )
                  .join(' · ')}
          </p>

          <p className="text-xs text-fg-muted">
            {t('payments.commission.provider', {
              provider: paymentProvider().name,
              mode: t(paymentsOn ? 'payments.commission.modeOn' : 'payments.commission.modeOff'),
            })}
          </p>
        </CardContent>
      </Card>

      <nav className="flex gap-2" aria-label={t('payments.filterLabel')}>
        {(['all', 'sampled'] as const).map((value) => (
          <Link
            key={value}
            href={`/admin/payments?filter=${value}`}
            aria-current={filter === value ? 'page' : undefined}
            className={
              filter === value
                ? 'rounded-full bg-accent-soft px-3 py-1 text-sm text-accent'
                : 'rounded-full bg-surface-2 px-3 py-1 text-sm text-fg-muted hover:text-fg'
            }
          >
            {t(`payments.filters.${value}`)}
          </Link>
        ))}
      </nav>

      {payments.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('payments.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {payments.map((payment) => (
            <li key={payment.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/deals/${payment.milestone.deal.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {payment.milestone.deal.title}
                    </Link>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm">
                        {payment.amount.toLocaleString(locale)} {payment.currency}
                      </span>
                      <Badge variant={CHECK_TONE[payment.adminCheck]}>
                        {t(`payments.check.${payment.adminCheck}`)}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-sm text-fg-muted">
                    {payment.milestone.title} · {payment.milestone.deal.customer.nickname} →{' '}
                    {payment.milestone.deal.designer.nickname} ·{' '}
                    {formatDate(payment.customerClaimedAt, locale)}
                  </p>

                  <ul className="flex flex-wrap gap-2">
                    {payment.files.map((file) => (
                      <li key={file.id}>
                        <a
                          href={`/api/deal-files/${file.id}?kind=receipt`}
                          className="text-sm text-accent hover:underline"
                        >
                          {file.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>

                  <PaymentReviewActions paymentId={payment.id} check={payment.adminCheck} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import type { MilestoneDetails, MilestoneView } from '@/components/deals/types';
import { formatDate } from '@/lib/utils';

/**
 * Вкладка «Чеки» (§4.6).
 *
 * Это журнал заявленных и подтверждённых оплат, а не бухгалтерия: платформа
 * денег не видит и подтверждает только то, что стороны сами прислали.
 */
export function DealReceipts({
  locale,
  details,
  milestones,
}: {
  locale: string;
  details: MilestoneDetails[];
  milestones: MilestoneView[];
}) {
  const t = useTranslations('deals.receipts');

  const withPayments = details.filter((detail) => detail.payments.length > 0);

  if (withPayments.length === 0) {
    return <p className="text-sm text-fg-muted">{t('empty')}</p>;
  }

  const tone = { pending: 'warning', confirmed: 'success', stuck: 'danger' } as const;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-muted">{t('disclaimer')}</p>

      {withPayments.map((detail) => {
        const milestone = milestones.find((entry) => entry.id === detail.milestoneId);

        return (
          <section key={detail.milestoneId} className="flex flex-col gap-3">
            <h3 className="font-medium">
              {milestone ? `${milestone.position}. ${milestone.title}` : ''}
            </h3>

            {detail.payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-[var(--radius-card)] border border-[var(--pf-border)] p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {payment.amount.toLocaleString(locale)} {payment.currency}
                  </span>
                  <Badge variant={tone[payment.status as keyof typeof tone] ?? 'neutral'}>
                    {t(`status.${payment.status}`)}
                  </Badge>
                </div>

                <p className="text-sm text-fg-muted">
                  {t('claimedAt', { date: formatDate(payment.customerClaimedAt, locale) })}
                  {payment.designerConfirmedAt
                    ? ` · ${t('confirmedAt', {
                        date: formatDate(payment.designerConfirmedAt, locale),
                      })}`
                    : ''}
                </p>

                {payment.txHash ? (
                  <p className="mt-1 text-sm break-all text-fg-muted">{payment.txHash}</p>
                ) : null}

                {payment.note ? <p className="mt-1 text-sm">{payment.note}</p> : null}

                <ul className="mt-2 flex flex-col gap-1">
                  {payment.files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={`/api/deal-files/${file.id}?kind=receipt`}
                        className="flex items-center gap-1.5 text-sm text-accent hover:underline"
                      >
                        <Download aria-hidden className="size-4" />
                        {file.fileName}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

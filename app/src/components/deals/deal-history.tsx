'use client';

import { useTranslations } from 'next-intl';

import { systemMessageValues } from '@/components/deals/system-message';
import type { DealMessageView } from '@/components/deals/types';
import { formatDate } from '@/lib/utils';

/**
 * Вкладка «История» (§4.6): только системные события, без реплик.
 *
 * Та же хронология есть и в чате вперемешку с разговором — здесь она
 * отдельно, чтобы в споре можно было прочесть сухую последовательность
 * фактов, не пролистывая переписку.
 */
export function DealHistory({
  locale,
  messages,
}: {
  locale: string;
  messages: DealMessageView[];
}) {
  const t = useTranslations('deals.system');
  const tCommon = useTranslations('deals.history');
  const tVerdicts = useTranslations('disputes.verdicts');

  const events = messages.filter((message) => message.kind === 'system' && message.systemKey);

  if (events.length === 0) {
    return <p className="text-sm text-fg-muted">{tCommon('empty')}</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="flex flex-col gap-0.5 border-l-2 border-accent/40 pl-3">
          <span className="text-sm">
            {t(
              event.systemKey as string,
              systemMessageValues(event.systemPayload, (verdict) => tVerdicts(verdict)),
            )}
          </span>
          <time className="text-xs text-fg-muted" dateTime={event.createdAt}>
            {formatDate(event.createdAt, locale)}
          </time>
        </li>
      ))}
    </ol>
  );
}

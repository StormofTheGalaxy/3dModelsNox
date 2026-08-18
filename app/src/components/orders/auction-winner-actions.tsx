'use client';

import { Check, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { acceptWin, declineWin } from '@/server/actions/auctions';

/**
 * Победитель торгов принимает условия или отказывается (§3).
 *
 * Отказ подтверждается диалогом не ради церемонии: торги необязывающие, но
 * отказ уходит в метрику надёжности профиля, и об этом честнее предупредить
 * до нажатия, а не после.
 */
export function AuctionWinnerActions({
  orderId,
  amount,
  currency,
  deadlineLabel,
}: {
  orderId: string;
  amount: number;
  currency: string;
  deadlineLabel: string | null;
}) {
  const t = useTranslations('orders.auction');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [declineOpen, setDeclineOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const result = await acceptWin(orderId);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      // Принятая победа сразу открывает сделку: следующий шаг сторон —
      // согласовать план этапов.
      if (result.dealId) {
        router.push(`/deals/${result.dealId}`);
        return;
      }

      router.refresh();
    });
  }

  function decline() {
    startTransition(async () => {
      const result = await declineWin(orderId);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      setDeclineOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Alert tone="success">
        {t('youWon', { amount: amount.toLocaleString(locale), currency })}
      </Alert>

      {deadlineLabel ? (
        <p className="text-sm text-fg-muted">{t('decideBy', { date: deadlineLabel })}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button loading={pending} onClick={accept}>
          <Check aria-hidden />
          {t('acceptWin')}
        </Button>

        <Button variant="ghost" onClick={() => setDeclineOpen(true)}>
          <X aria-hidden />
          {t('declineWin')}
        </Button>
      </div>

      <Modal open={declineOpen} onOpenChange={setDeclineOpen}>
        <ModalContent
          title={t('declineWin')}
          description={t('declineWarning')}
          closeLabel={tCommon('close')}
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeclineOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button variant="danger" loading={pending} onClick={decline}>
              {t('declineWin')}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

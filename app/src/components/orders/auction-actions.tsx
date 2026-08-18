'use client';

import { Crown, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Modal, ModalContent } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { closeAuction, selectWinner } from '@/server/actions/auctions';

/** Досрочное закрытие торгов заказчиком. */
export function CloseAuctionButton({ orderId }: { orderId: string }) {
  const t = useTranslations('orders.auction');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    startTransition(async () => {
      const result = await closeAuction(orderId);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Lock aria-hidden />
        {t('closeEarly')}
      </Button>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent
          title={t('closeEarly')}
          description={t('closeEarlyWarning')}
          closeLabel={tCommon('close')}
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button loading={pending} onClick={close}>
              {tCommon('confirm')}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}

/**
 * Выбор победителя. Сделка отсюда ещё не рождается: победитель должен
 * подтвердить, и до этого заказ остаётся в торгах (§3).
 */
export function SelectWinnerButton({
  bidId,
  nickname,
}: {
  bidId: string;
  nickname: string;
}) {
  const t = useTranslations('orders.auction');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick() {
    startTransition(async () => {
      const result = await selectWinner(bidId);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Crown aria-hidden />
        {t('pickWinner')}
      </Button>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent
          title={t('pickWinner')}
          description={t('pickWinnerConfirm', { nickname })}
          closeLabel={tCommon('close')}
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button loading={pending} onClick={pick}>
              {tCommon('confirm')}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}

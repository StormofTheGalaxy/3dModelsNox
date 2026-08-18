'use client';

import { Check, Star, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { RESPONSE_REJECT_REASONS } from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Modal, ModalContent } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { setResponseStatus } from '@/server/actions/responses';

/**
 * Действия заказчика над откликом (§4.5): шортлист, отказ с шаблонной
 * причиной, принятие.
 */
export function ResponseActions({
  responseId,
  status,
}: {
  responseId: string;
  status: string;
}) {
  const t = useTranslations('orders.responses');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [reason, setReason] = useState<string>(RESPONSE_REJECT_REASONS[0]);
  const [pending, startTransition] = useTransition();

  function change(next: string, rejectReason?: string) {
    startTransition(async () => {
      const result = await setResponseStatus(responseId, next, rejectReason);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      setRejectOpen(false);
      setAcceptOpen(false);

      // Принятый отклик сразу открывает сделку: следующий шаг сторон —
      // согласовать план этапов, а не возвращаться к списку откликов.
      if (result.dealId) {
        router.push(`/deals/${result.dealId}`);
        return;
      }

      router.refresh();
    });
  }

  // Принятый отклик закрывает заказ — дальнейшие действия бессмысленны.
  if (status === 'accepted') return null;

  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'shortlist' ? (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => change('shortlist')}>
          <Star aria-hidden />
          {t('shortlist')}
        </Button>
      ) : null}

      {status !== 'rejected' ? (
        <Button size="sm" variant="ghost" onClick={() => setRejectOpen(true)}>
          <X aria-hidden />
          {t('reject')}
        </Button>
      ) : null}

      <Button size="sm" onClick={() => setAcceptOpen(true)}>
        <Check aria-hidden />
        {t('accept')}
      </Button>

      <Modal open={rejectOpen} onOpenChange={setRejectOpen}>
        <ModalContent title={t('reject')} closeLabel={tCommon('close')}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject-reason">{t('rejectReason')}</Label>
              <Select
                id="reject-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              >
                {RESPONSE_REJECT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`reasons.${value}`)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejectOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button variant="danger" loading={pending} onClick={() => change('rejected', reason)}>
                {t('reject')}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={acceptOpen} onOpenChange={setAcceptOpen}>
        <ModalContent
          title={t('accept')}
          description={t('acceptConfirm')}
          closeLabel={tCommon('close')}
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAcceptOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button loading={pending} onClick={() => change('accepted')}>
              {tCommon('confirm')}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

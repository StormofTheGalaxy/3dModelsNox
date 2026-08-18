'use client';

import { EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Modal, ModalContent } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { unpublishOrder } from '@/server/actions/admin';

/** Снятие заказа с витрины (§4.10): автор получает уведомление с причиной. */
export function UnpublishOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations('admin.orders');
  const tRoot = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  function unpublish() {
    startTransition(async () => {
      const result = await unpublishOrder(orderId, reason);
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
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <EyeOff aria-hidden className="size-4" />
        {t('unpublish')}
      </Button>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent title={t('unpublish')} description={t('unpublishHint')}>
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor={`unpublish-${orderId}`}>{t('reason')}</Label>
              <Textarea
                id={`unpublish-${orderId}`}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>

            <Button variant="danger" loading={pending} onClick={unpublish}>
              {t('unpublish')}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}

'use client';

import { CalendarPlus, EyeOff, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Modal, ModalContent } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { cancelOrder, extendOrder, inviteDesigner } from '@/server/actions/orders';

/** Действия владельца заказа (§4.5): продление, приглашение, снятие с витрины. */
export function OrderOwnerActions({
  orderId,
  canManage,
}: {
  orderId: string;
  canManage: boolean;
}) {
  const t = useTranslations('orders');
  const tInvite = useTranslations('orders.invite');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [pending, startTransition] = useTransition();

  function extend() {
    startTransition(async () => {
      const result = await extendOrder(orderId);
      if (!result.ok) {
        toast.error(tRoot('errors.generic'));
        return;
      }
      toast.success(t('extended'));
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelOrder(orderId);
      if (!result.ok) {
        toast.error(tRoot('errors.generic'));
        return;
      }
      toast.success(t('cancelled'));
      router.refresh();
    });
  }

  function invite() {
    startTransition(async () => {
      const result = await inviteDesigner(orderId, nickname.trim());
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      toast.success(tInvite('sent'));
      setInviteOpen(false);
      setNickname('');
      router.refresh();
    });
  }

  if (!canManage) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
        <UserPlus aria-hidden />
        {tInvite('title')}
      </Button>

      <Button size="sm" variant="outline" loading={pending} onClick={extend}>
        <CalendarPlus aria-hidden />
        {t('extend')}
      </Button>

      <Button size="sm" variant="ghost" onClick={cancel}>
        <EyeOff aria-hidden />
        {t('cancel')}
      </Button>

      <Modal open={inviteOpen} onOpenChange={setInviteOpen}>
        <ModalContent title={tInvite('title')} description={tInvite('hint')} closeLabel={tCommon('close')}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-nickname">@</Label>
              <Input
                id="invite-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="nickname"
                autoComplete="off"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button loading={pending} disabled={nickname.trim().length < 2} onClick={invite}>
                {tInvite('submit')}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

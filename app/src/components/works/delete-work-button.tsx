'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalTrigger } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { deleteWork } from '@/server/actions/works';

/** Удаление работы с подтверждением: файлы стираются безвозвратно. */
export function DeleteWorkButton({
  workId,
  nickname,
}: {
  workId: string;
  nickname: string;
}) {
  const t = useTranslations('works');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteWork(workId);

      if (!result.ok) {
        toast.error(t('deleteConfirm'));
        return;
      }

      toast.success(t('deleted'));
      setOpen(false);
      router.push(`/designers/${nickname}`);
      router.refresh();
    });
  }

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 aria-hidden />
          {t('delete')}
        </Button>
      </ModalTrigger>

      <ModalContent title={t('delete')} description={t('deleteConfirm')} closeLabel={tCommon('close')}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tCommon('cancel')}
          </Button>
          <Button variant="danger" loading={pending} onClick={confirm}>
            {tCommon('confirm')}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}

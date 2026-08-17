'use client';

import { Archive, BookmarkPlus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { archiveBrief, deleteBrief, saveBriefAsTemplate } from '@/server/actions/briefs';

/** Действия владельца ТЗ: свой шаблон, архив, удаление (§4.4). */
export function BriefOwnerActions({
  briefId,
  canModify,
}: {
  briefId: string;
  canModify: boolean;
}) {
  const t = useTranslations('brief');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();

  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [pending, startTransition] = useTransition();

  function saveTemplate() {
    startTransition(async () => {
      const result = await saveBriefAsTemplate(briefId, templateTitle);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      toast.success(t('templateSaved'));
      setTemplateOpen(false);
      setTemplateTitle('');
    });
  }

  function archive() {
    startTransition(async () => {
      const result = await archiveBrief(briefId);
      if (!result.ok) {
        toast.error(tRoot('errors.generic'));
        return;
      }
      router.push('/briefs');
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteBrief(briefId);
      if (!result.ok) {
        toast.error(tRoot('errors.generic'));
        return;
      }
      toast.success(t('deleted'));
      router.push('/briefs');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="justify-start" onClick={() => setTemplateOpen(true)}>
          <BookmarkPlus aria-hidden />
          {t('saveAsTemplate')}
        </Button>

        {canModify ? (
          <>
            <Button variant="ghost" size="sm" className="justify-start" onClick={archive}>
              <Archive aria-hidden />
              {t('archive')}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-[var(--pf-danger)]"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 aria-hidden />
              {t('delete')}
            </Button>
          </>
        ) : null}

        <Modal open={templateOpen} onOpenChange={setTemplateOpen}>
          <ModalContent title={t('saveAsTemplate')} closeLabel={tCommon('close')}>
            <div className="flex flex-col gap-4">
              <Input
                value={templateTitle}
                onChange={(event) => setTemplateTitle(event.target.value)}
                placeholder={t('templateTitle')}
                maxLength={140}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setTemplateOpen(false)}>
                  {tCommon('cancel')}
                </Button>
                <Button loading={pending} onClick={saveTemplate}>
                  {tCommon('save')}
                </Button>
              </div>
            </div>
          </ModalContent>
        </Modal>

        <Modal open={deleteOpen} onOpenChange={setDeleteOpen}>
          <ModalContent
            title={t('delete')}
            description={t('deleteConfirm')}
            closeLabel={tCommon('close')}
          >
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button variant="danger" loading={pending} onClick={remove}>
                {tCommon('confirm')}
              </Button>
            </div>
          </ModalContent>
        </Modal>
      </CardContent>
    </Card>
  );
}

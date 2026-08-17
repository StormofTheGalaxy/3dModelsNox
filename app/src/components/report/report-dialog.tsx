'use client';

import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { REPORT_CATEGORIES, type ReportTargetType } from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Modal, ModalContent, ModalTrigger } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { submitReport } from '@/server/actions/works';
import { idleState, type ActionState } from '@/server/actions/types';

/**
 * Кнопка «Пожаловаться» (§4.3). Работы не проходят премодерацию, поэтому
 * жалоба — основной инструмент постмодерации, и она должна быть на всём.
 */
export function ReportDialog({
  targetType,
  targetId,
}: {
  targetType: ReportTargetType;
  targetId: string;
}) {
  const t = useTranslations('report');
  const tRoot = useTranslations();
  const tTax = useTranslations('taxonomy');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);

  // Обёртка вокруг действия: тост и закрытие — реакция на отправку формы,
  // а не побочный эффект рендера.
  const [, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await submitReport(previous, formData);

      if (result.status === 'success' && result.message) {
        toast.success(tRoot(result.message));
        setOpen(false);
      }

      return result;
    },
    idleState,
  );

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <Flag className="size-3.5" aria-hidden />
          {t('button')}
        </button>
      </ModalTrigger>

      <ModalContent title={t('title')} description={t('description')} closeLabel={tCommon('close')}>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-category">{t('category')}</Label>
            <Select id="report-category" name="category" defaultValue={REPORT_CATEGORIES[0]}>
              {REPORT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {tTax(`reportCategory.${category}`)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-text">{t('text')}</Label>
            <Textarea
              id="report-text"
              name="text"
              maxLength={2000}
              placeholder={t('textHint')}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              {t('submit')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

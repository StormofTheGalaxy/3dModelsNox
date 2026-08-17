'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Modal, ModalContent, ModalTrigger } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { saveFilter } from '@/server/actions/orders';
import { idleState, type ActionState } from '@/server/actions/types';

/**
 * «Сохранить поиск» (§4.5): текущие фильтры превращаются в подписку
 * на новые подходящие заказы.
 */
export function SaveFilterDialog({
  params,
  trigger,
}: {
  params: Record<string, string>;
  trigger: ReactNode;
}) {
  const t = useTranslations('orders.savedFilters');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();

  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await saveFilter(previous, formData);

      if (result.status === 'success' && result.message) {
        toast.success(tRoot(result.message));
        setOpen(false);
      }

      return result;
    },
    idleState,
  );

  // В подписку уходят только осмысленные параметры фильтра, без курсора
  // и сортировки: они на подбор заказов не влияют.
  const meaningful = Object.fromEntries(
    Object.entries(params).filter(([key]) => !['cursor', 'sort'].includes(key)),
  );

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>{trigger}</ModalTrigger>

      <ModalContent title={t('save')} description={t('saveHint')} closeLabel={tCommon('close')}>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="params" value={JSON.stringify(normalize(meaningful))} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-title">{t('name')}</Label>
            <Input
              id="filter-title"
              name="title"
              required
              maxLength={80}
              invalid={Boolean(state.fieldErrors?.title)}
            />
            {state.fieldErrors?.title ? (
              <p className="text-sm text-[var(--pf-danger)]">{tRoot(state.fieldErrors.title)}</p>
            ) : null}
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="notifyEmail"
              defaultChecked
              className="size-4 accent-[var(--pf-accent)]"
            />
            {t('notifyEmail')}
          </label>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="notifyInApp"
              defaultChecked
              className="size-4 accent-[var(--pf-accent)]"
            />
            {t('notifyInApp')}
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {tCommon('save')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

/** URL хранит всё строками — числа и флаги приводим к типам схемы фильтра. */
function normalize(params: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;

    if (key === 'budgetMin' || key === 'budgetMax' || key === 'deadlineWithinDays') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) result[key] = parsed;
      continue;
    }

    if (key === 'verified') {
      result.verifiedCustomersOnly = value === '1';
      continue;
    }

    if (key === 'noResponses') {
      result.noResponsesOnly = value === '1';
      continue;
    }

    result[key] = value;
  }

  return result;
}

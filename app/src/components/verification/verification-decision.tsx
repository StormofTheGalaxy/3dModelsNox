'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import { decideVerification } from '@/server/actions/verification';
import { idleState, type ActionState } from '@/server/actions/types';

/**
 * Решение модератора по заявке (§4.9).
 *
 * Комментарий обязателен при отказе: дизайнеру нужно понять, что исправить
 * к повторной подаче, иначе повтор будет таким же.
 */
export function VerificationDecision({ requestId }: { requestId: string }) {
  const t = useTranslations('verification');
  const tRoot = useTranslations();
  const router = useRouter();

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await decideVerification(previous, formData);
      if (result.status === 'success') router.refresh();
      return result;
    },
    idleState,
  );

  return (
    <form action={action} className="flex flex-col gap-3 border-t border-[var(--pf-border)] pt-3">
      <input type="hidden" name="requestId" value={requestId} />

      <div>
        <Label htmlFor={`note-${requestId}`}>{t('decisionNote')}</Label>
        <Textarea id={`note-${requestId}`} name="note" rows={3} maxLength={2000} />
      </div>

      {state.status === 'error' && state.message ? (
        <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
      ) : null}

      {/* Решение передаётся значением самой кнопки: состояние React к моменту
          отправки формы обновиться не успевает, а submitter попадает в FormData. */}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="approve" value="true" size="sm" loading={pending}>
          <Check aria-hidden className="size-4" />
          {t('approve')}
        </Button>
        <Button type="submit" name="approve" value="false" size="sm" variant="secondary" loading={pending}>
          <X aria-hidden className="size-4" />
          {t('reject')}
        </Button>
      </div>
    </form>
  );
}

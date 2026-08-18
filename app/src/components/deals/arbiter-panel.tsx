'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';

import { DISPUTE_VERDICTS } from '@polyforge/shared';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { resolveDispute, summarizeDispute } from '@/server/actions/disputes';
import { idleState, type ActionState } from '@/server/actions/types';

/**
 * Рабочее место арбитра (§4.6).
 *
 * Саммари — вспомогательный инструмент: вердикт всё равно ставит человек,
 * и в решении фиксируется его формулировка, а не текст модели.
 */
export function ArbiterPanel({
  disputeId,
  status,
  verdict,
  aiSummary,
  resolutionNote,
}: {
  disputeId: string;
  status: string;
  verdict: string | null;
  aiSummary: string | null;
  resolutionNote: string | null;
}) {
  const t = useTranslations('disputes');
  const tRoot = useTranslations();
  const router = useRouter();

  const [summary, setSummary] = useState(aiSummary);
  const [summarizing, startSummary] = useTransition();

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await resolveDispute(previous, formData);

      if (result.status === 'success') {
        toast.success(tRoot(result.message ?? 'settings.saved'));
        router.refresh();
      }

      return result;
    },
    idleState,
  );

  function requestSummary() {
    startSummary(async () => {
      const result = await summarizeDispute(disputeId);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      setSummary(result.summary ?? null);
    });
  }

  if (status === 'resolved') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <h2 className="font-bold">{t('verdict')}</h2>
          <p className="text-sm">{verdict ? t(`verdicts.${verdict}`) : ''}</p>
          {resolutionNote ? (
            <p className="text-sm whitespace-pre-line text-fg-muted">{resolutionNote}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{t('resolve')}</h2>
          <Button size="sm" variant="secondary" loading={summarizing} onClick={requestSummary}>
            <Sparkles aria-hidden className="size-4" />
            {t('summarize')}
          </Button>
        </div>

        {summary ? (
          <div className="rounded-[var(--radius-control)] bg-surface-2 p-3 text-sm whitespace-pre-line">
            {summary}
          </div>
        ) : null}

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="disputeId" value={disputeId} />

          <div>
            <Label htmlFor="verdict">{t('verdict')}</Label>
            <Select id="verdict" name="verdict" defaultValue={DISPUTE_VERDICTS[0]}>
              {DISPUTE_VERDICTS.map((value) => (
                <option key={value} value={value}>
                  {t(`verdicts.${value}`)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="resolution">{t('resolutionNote')}</Label>
            <Textarea id="resolution" name="resolutionNote" rows={4} required minLength={20} />
          </div>

          {state.status === 'error' && state.message ? (
            <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
          ) : null}

          <Button type="submit" loading={pending}>
            {t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

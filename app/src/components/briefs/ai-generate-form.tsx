'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { generateBriefFromPrompt } from '@/server/actions/ai';
import { idleState } from '@/server/actions/types';

/**
 * «✨ Создать из описания» (§4.4, пункт 1): свободный текст → заполненный
 * черновик всех пяти секций.
 */
export function AIGenerateForm({
  briefId,
  isLive,
  creditsLeft,
}: {
  briefId: string;
  isLive: boolean;
  creditsLeft: number;
}) {
  const t = useTranslations('brief.ai');
  const tRoot = useTranslations();
  const [state, formAction, pending] = useActionState(generateBriefFromPrompt, idleState);
  useActionRedirect(state);

  return (
    <Card className="border-accent/30">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="size-4 text-accent" aria-hidden />
            {t('generateTitle')}
          </h2>
          <span className="text-xs text-fg-muted">{t('creditsLeft', { left: creditsLeft })}</span>
        </div>

        <p className="text-sm text-fg-muted">{t('generateHint')}</p>

        {!isLive ? <Alert tone="warning">{t('stubWarning')}</Alert> : null}

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="briefId" value={briefId} />

          <Textarea
            name="prompt"
            rows={4}
            required
            minLength={20}
            maxLength={2000}
            placeholder={t('generatePlaceholder')}
            invalid={Boolean(state.fieldErrors?.prompt)}
          />

          {state.fieldErrors?.prompt ? (
            <p className="text-sm text-[var(--pf-danger)]">{tRoot(state.fieldErrors.prompt)}</p>
          ) : null}

          <FormMessage state={state} />

          <Button type="submit" loading={pending} disabled={creditsLeft <= 0} className="sm:w-fit">
            {t('generateSubmit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

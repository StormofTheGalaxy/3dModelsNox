'use client';

import { Mail } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/forms/form-message';
import { TurnstileField } from '@/components/forms/turnstile-field';
import { joinWaitlistAction } from '@/server/actions/auth';
import { idleState } from '@/server/actions/types';

/** Лист ожидания на лендинге (§4.11): гость оставляет email, админ шлёт инвайт. */
export function WaitlistForm({ siteKey }: { siteKey: string }) {
  const t = useTranslations('landing');
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(joinWaitlistAction, idleState);

  if (state.status === 'success') {
    return <FormMessage state={state} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={t('waitlistPlaceholder')}
          aria-label={t('waitlistTitle')}
          invalid={Boolean(state.fieldErrors?.email)}
          className="sm:flex-1"
        />
        <Button type="submit" loading={pending} className="sm:w-auto">
          <Mail aria-hidden />
          {t('waitlistSubmit')}
        </Button>
      </div>

      <TurnstileField siteKey={siteKey} />
      <FormMessage state={state} />
    </form>
  );
}

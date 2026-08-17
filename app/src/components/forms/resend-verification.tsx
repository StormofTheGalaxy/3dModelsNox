'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/forms/form-message';
import { resendVerificationAction } from '@/server/actions/auth';
import { idleState } from '@/server/actions/types';

export function ResendVerification() {
  const t = useTranslations('auth');
  const [state, formAction, pending] = useActionState(resendVerificationAction, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" block loading={pending}>
        {t('verifyResend')}
      </Button>
    </form>
  );
}

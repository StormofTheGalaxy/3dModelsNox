'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { FormMessage } from '@/components/forms/form-message';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { Link } from '@/i18n/navigation';
import { loginAction } from '@/server/actions/auth';
import { idleState } from '@/server/actions/types';

export function LoginForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations();

  const [state, formAction, pending] = useActionState(loginAction, idleState);
  useActionRedirect(state);

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tErrors(key) : undefined;
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label={t('email')} error={fieldError('email')} required>
        {({ id, invalid, describedBy }) => (
          <Input
            id={id}
            name="email"
            type="email"
            required
            autoComplete="email"
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <Field label={t('password')} error={fieldError('password')} required>
        {({ id, invalid, describedBy }) => (
          <Input
            id={id}
            name="password"
            type="password"
            required
            autoComplete="current-password"
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <FormMessage state={state} />

      <Button type="submit" size="lg" block loading={pending}>
        {t('submitLogin')}
      </Button>

      <Link href="/forgot-password" className="text-center text-sm text-fg-muted hover:text-fg">
        {t('forgotPassword')}
      </Link>
    </form>
  );
}

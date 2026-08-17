'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { FormMessage } from '@/components/forms/form-message';
import { TurnstileField } from '@/components/forms/turnstile-field';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { forgotPasswordAction, resetPasswordAction } from '@/server/actions/auth';
import { idleState } from '@/server/actions/types';

export function ForgotPasswordForm({ siteKey }: { siteKey: string }) {
  const t = useTranslations('auth');
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState(forgotPasswordAction, idleState);

  // Успех показываем как сообщение и прячем форму: повторная отправка
  // на этом экране только помогает перебирать адреса.
  if (state.status === 'success') {
    return <FormMessage state={state} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label={t('email')}
        error={state.fieldErrors?.email ? tErrors(state.fieldErrors.email) : undefined}
        required
      >
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

      <TurnstileField siteKey={siteKey} />
      <FormMessage state={state} />

      <Button type="submit" size="lg" block loading={pending}>
        {t('forgotSubmit')}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState(resetPasswordAction, idleState);
  useActionRedirect(state);

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tErrors(key) : undefined;
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <Field label={t('password')} error={fieldError('password')} required>
        {({ id, invalid, describedBy }) => (
          <Input
            id={id}
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <Field label={t('passwordConfirm')} error={fieldError('passwordConfirm')} required>
        {({ id, invalid, describedBy }) => (
          <Input
            id={id}
            name="passwordConfirm"
            type="password"
            required
            autoComplete="new-password"
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <FormMessage state={state} />

      <Button type="submit" size="lg" block loading={pending}>
        {t('resetSubmit')}
      </Button>
    </form>
  );
}

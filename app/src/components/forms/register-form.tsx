'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { FormMessage } from '@/components/forms/form-message';
import { TurnstileField } from '@/components/forms/turnstile-field';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { Link } from '@/i18n/navigation';
import { registerAction } from '@/server/actions/auth';
import { idleState } from '@/server/actions/types';

export function RegisterForm({
  siteKey,
  inviteOnly,
  presetInviteCode = '',
}: {
  siteKey: string;
  inviteOnly: boolean;
  presetInviteCode?: string;
}) {
  const t = useTranslations('auth');
  const tErrors = useTranslations();
  const locale = useLocale();

  const [state, formAction, pending] = useActionState(registerAction, idleState);
  useActionRedirect(state);

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tErrors(key) : undefined;
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

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

      <Field label={t('nickname')} error={fieldError('nickname')} hint={t('nicknameHint')} required>
        {({ id, invalid, describedBy }) => (
          <Input
            id={id}
            name="nickname"
            required
            autoComplete="username"
            minLength={2}
            maxLength={32}
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

      <Field
        label={t('inviteCode')}
        error={fieldError('inviteCode')}
        hint={t('inviteCodeHint')}
        required={inviteOnly}
      >
        {({ id, invalid, describedBy }) => (
          <Input
            id={id}
            name="inviteCode"
            defaultValue={presetInviteCode}
            required={inviteOnly}
            maxLength={10}
            autoCapitalize="characters"
            className="font-mono tracking-[0.2em] uppercase"
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      {/* Человеку без кода форма раньше ничего не предлагала: он упирался
          в обязательное поле и уходил. Лист ожидания — единственный путь
          внутрь в закрытой бете, и сказать о нём надо здесь. */}
      {inviteOnly && !presetInviteCode ? (
        <p className="-mt-2 text-sm text-fg-muted">
          {t('noInvite')}{' '}
          <Link href="/#waitlist" className="text-accent hover:underline">
            {t('joinWaitlist')}
          </Link>
        </p>
      ) : null}

      <label className="flex items-start gap-2.5 text-sm text-fg-muted">
        <input
          type="checkbox"
          name="acceptTerms"
          required
          className="mt-0.5 size-4 accent-[var(--pf-accent)]"
        />
        <span>
          {t.rich('acceptTerms', {
            terms: (chunks) => (
              <Link href="/legal/terms" className="text-accent hover:underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/legal/privacy" className="text-accent hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>

      <TurnstileField siteKey={siteKey} />

      <FormMessage state={state} />

      <Button type="submit" size="lg" block loading={pending}>
        {t('submitRegister')}
      </Button>
    </form>
  );
}

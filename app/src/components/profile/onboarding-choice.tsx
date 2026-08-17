'use client';

import { Briefcase, Palette, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/forms/form-message';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { completeOnboarding } from '@/server/actions/profile';
import { idleState } from '@/server/actions/types';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'customer', icon: Briefcase, labelKey: 'iOrder' },
  { value: 'designer', icon: Palette, labelKey: 'iMake' },
  { value: 'both', icon: Sparkles, labelKey: 'iBoth' },
] as const;

/** Выбор «зачем я здесь» (§4.1): создаёт нужные профили и ведёт к их заполнению. */
export function OnboardingChoice() {
  const t = useTranslations('onboarding');
  const [intent, setIntent] = useState<string>('designer');
  const [state, formAction, pending] = useActionState(completeOnboarding, idleState);
  useActionRedirect(state);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="intent" value={intent} />

      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const active = intent === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setIntent(option.value)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-center gap-2.5 rounded-[var(--radius-card)] border p-5 text-center',
                'transition-all duration-150 ease-[var(--ease-out-quick)]',
                active
                  ? 'border-accent bg-accent-soft shadow-[var(--shadow-glow)]'
                  : 'border-[var(--pf-border)] hover:border-accent/50',
              )}
            >
              <option.icon
                className={cn('size-6', active ? 'text-accent' : 'text-fg-muted')}
                aria-hidden
              />
              <span className="text-sm font-medium">{t(option.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <FormMessage state={state} />

      <Button type="submit" size="lg" block loading={pending}>
        {t('start')}
      </Button>
    </form>
  );
}

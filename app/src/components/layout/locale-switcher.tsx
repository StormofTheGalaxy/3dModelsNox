'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { LOCALES, LOCALE_LABELS, LOCALE_SHORT_LABELS, type Locale } from '@polyforge/shared';

import { usePathname, useRouter } from '@/i18n/navigation';
import { setLocalePreference } from '@/server/actions/preferences';
import { cn } from '@/lib/utils';

/**
 * Переключатель языка: меняет префикс URL и запоминает выбор
 * (кука + профиль пользователя).
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const t = useTranslations('locale');
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function select(locale: Locale) {
    if (locale === current) return;

    startTransition(() => {
      void setLocalePreference(locale);
      // pathname из next-intl уже без языкового префикса — его подставит router.
      router.replace(pathname, { locale });
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t('switch')}
        disabled={isPending}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5',
          'text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
          'disabled:opacity-60',
        )}
      >
        <Languages className="size-4" aria-hidden />
        {LOCALE_SHORT_LABELS[current]}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className={cn(
            'z-50 min-w-40 rounded-[var(--radius-control)] border border-[var(--pf-border)]',
            'bg-surface p-1 shadow-[var(--shadow-soft)]',
            'data-[state=open]:[animation:pf-fade-in_120ms_var(--ease-out-quick)]',
          )}
        >
          {LOCALES.map((locale) => (
            <DropdownMenu.Item
              key={locale}
              onSelect={() => select(locale)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none',
                'data-[highlighted]:bg-surface-2',
              )}
            >
              <span className="flex-1">{LOCALE_LABELS[locale]}</span>
              {locale === current ? <Check className="size-3.5 text-accent" aria-hidden /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

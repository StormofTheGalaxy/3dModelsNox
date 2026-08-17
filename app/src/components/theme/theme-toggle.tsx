'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import type { Theme } from '@polyforge/shared';

import { setThemePreference } from '@/server/actions/preferences';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; icon: typeof Sun; labelKey: 'dark' | 'light' | 'system' }[] = [
  { value: 'dark', icon: Moon, labelKey: 'dark' },
  { value: 'light', icon: Sun, labelKey: 'light' },
  { value: 'system', icon: Monitor, labelKey: 'system' },
];

function applyTheme(theme: Theme): void {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;

  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(resolved);
}

export function ThemeToggle({ current }: { current: Theme }) {
  const t = useTranslations('theme');
  const [theme, setTheme] = useState<Theme>(current);
  const [, startTransition] = useTransition();

  function select(next: Theme) {
    // Класс меняем сразу — ждать ответа сервера ради переключения темы незачем.
    setTheme(next);
    applyTheme(next);
    startTransition(() => {
      void setThemePreference(next);
    });
  }

  const ActiveIcon = OPTIONS.find((option) => option.value === theme)?.icon ?? Moon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t('toggle')}
        className={cn(
          'flex size-9 items-center justify-center rounded-[var(--radius-control)]',
          'text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
        )}
      >
        <ActiveIcon className="size-4" aria-hidden />
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
          {OPTIONS.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => select(option.value)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none',
                'data-[highlighted]:bg-surface-2',
              )}
            >
              <option.icon className="size-4 text-fg-muted" aria-hidden />
              <span className="flex-1">{t(option.labelKey)}</span>
              {theme === option.value ? <Check className="size-3.5 text-accent" aria-hidden /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

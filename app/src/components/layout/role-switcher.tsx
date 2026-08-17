'use client';

import { Briefcase, Palette } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { RoleContext } from '@polyforge/shared';

import { setRoleContext } from '@/server/actions/preferences';
import { cn } from '@/lib/utils';

/**
 * Переключатель контекста в шапке (§4.2): один аккаунт, два профиля.
 * Меняет кабинет и меню, но не роль в системе прав.
 */
export function RoleSwitcher({ current }: { current: RoleContext }) {
  const t = useTranslations('roleContext');
  const router = useRouter();
  const [role, setRole] = useState<RoleContext>(current);
  const [isPending, startTransition] = useTransition();

  function select(next: RoleContext) {
    if (next === role) return;
    setRole(next);
    startTransition(async () => {
      await setRoleContext(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="flex items-center gap-0.5 rounded-[var(--radius-control)] bg-surface-2 p-0.5"
    >
      {(
        [
          { value: 'designer', icon: Palette },
          { value: 'customer', icon: Briefcase },
        ] as const
      ).map((option) => {
        const active = role === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            disabled={isPending}
            aria-pressed={active}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium',
              'transition-all duration-150 ease-[var(--ease-out-quick)] disabled:opacity-70',
              active
                ? 'bg-surface text-fg shadow-[var(--shadow-soft)]'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            <option.icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{t(option.value)}</span>
          </button>
        );
      })}
    </div>
  );
}

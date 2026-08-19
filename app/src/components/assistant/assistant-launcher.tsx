'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { AssistantPanel, type PanelAction } from '@/components/assistant/assistant-panel';
import { cn } from '@/lib/utils';

/**
 * Кнопка ассистента в шапке (post-MVP №10).
 *
 * Контекст определяется по адресу страницы, а не передаётся с каждого
 * экрана: иначе подключение ассистента к новой странице означало бы
 * правку самой страницы, и однажды кто-то забыл бы.
 */

const RULES: { pattern: RegExp; scope: string }[] = [
  { pattern: /^\/briefs\/([^/]+)/u, scope: 'brief' },
  { pattern: /^\/orders\/([^/]+)\/responses/u, scope: 'order' },
  { pattern: /^\/orders\/([^/]+)/u, scope: 'order' },
  { pattern: /^\/deals\/([^/]+)/u, scope: 'deal' },
  { pattern: /^\/responses/u, scope: 'response' },
  { pattern: /^\/settings/u, scope: 'profile' },
  { pattern: /^\/designers\/([^/]+)/u, scope: 'profile' },
];

/** Служебные сегменты — это не идентификатор сущности. */
const NOT_AN_ID = new Set(['new', 'mine', 'edit']);

function detect(pathname: string): { scope: string; entityId: string | null } {
  // Языковой префикс к делу не относится: /ru/orders/123 и /en/orders/123 —
  // один и тот же экран.
  const path = pathname.replace(/^\/(ru|en)(?=\/|$)/u, '') || '/';

  for (const rule of RULES) {
    const match = rule.pattern.exec(path);
    if (!match) continue;

    const candidate = match[1] ?? null;
    return {
      scope: rule.scope,
      entityId: candidate && !NOT_AN_ID.has(candidate) ? candidate : null,
    };
  }

  return { scope: 'general', entityId: null };
}

export function AssistantLauncher({
  actionsByScope,
  credits,
  isLive,
}: {
  actionsByScope: Record<string, PanelAction[]>;
  credits: number;
  isLive: boolean;
}) {
  const t = useTranslations('assistant');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const { scope, entityId } = detect(pathname);

  const actions = (actionsByScope[scope] ?? actionsByScope.general ?? []).map((action) => ({
    ...action,
    href: action.href.includes(':id')
      ? entityId
        ? action.href.replace(':id', entityId)
        : action.href.replace(/\/:id.*$/u, '')
      : action.href,
  }));

  return (
    <>
      <button
        type="button"
        aria-label={t('title')}
        title={t('title')}
        onClick={() => setOpen(true)}
        className={cn(
          'flex size-9 items-center justify-center rounded-[var(--radius-control)]',
          'text-fg-muted transition-colors hover:bg-surface-2 hover:text-accent',
        )}
      >
        <Sparkles aria-hidden className="size-4" />
      </button>

      <AssistantPanel
        open={open}
        onClose={() => setOpen(false)}
        scope={scope}
        entityId={entityId}
        actions={actions}
        credits={credits}
        isLive={isLive}
      />
    </>
  );
}

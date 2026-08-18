'use client';

import { Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { setTranslationPreferences } from '@/server/actions/preferences';

/**
 * Языковые настройки (§4.7).
 *
 * Переключатели отвечают сразу, не дожидаясь сервера: иначе тумблер выглядит
 * сломанным. При ошибке значение возвращается на место.
 */
export function TranslationSettings({
  incoming,
  outgoing,
  content,
}: {
  incoming: boolean;
  outgoing: boolean;
  content: boolean;
}) {
  const t = useTranslations('settings.translation');
  const tRoot = useTranslations();

  const [state, setState] = useState({ incoming, outgoing, content });
  const [, startTransition] = useTransition();

  function toggle(key: 'incoming' | 'outgoing' | 'content', value: boolean) {
    setState((current) => ({ ...current, [key]: value }));

    startTransition(async () => {
      const result = await setTranslationPreferences({ [key]: value });
      if (!result.ok) {
        setState((current) => ({ ...current, [key]: !value }));
        toast.error(tRoot('errors.generic'));
      }
    });
  }

  const rows = [
    { key: 'incoming' as const, value: state.incoming },
    { key: 'outgoing' as const, value: state.outgoing },
    { key: 'content' as const, value: state.content },
  ];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages aria-hidden className="size-5 text-fg-muted" />
          {t('title')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {rows.map((row) => (
          <label
            key={row.key}
            className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--pf-border)] pb-4 last:border-0 last:pb-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t(`${row.key}.label`)}</span>
              <span className="block text-sm text-fg-muted">{t(`${row.key}.hint`)}</span>
            </span>

            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={row.value}
              onChange={(event) => toggle(row.key, event.target.checked)}
            />
          </label>
        ))}

        <p className="text-xs text-fg-muted">{t('disclaimer')}</p>
      </CardContent>
    </Card>
  );
}

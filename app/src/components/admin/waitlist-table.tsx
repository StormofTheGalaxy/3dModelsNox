'use client';

import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { inviteFromWaitlist } from '@/server/actions/admin';

/**
 * Лист ожидания с выбором адресатов (§4.11).
 *
 * Рассылка идёт только по выбранным, а не «всем сразу»: закрытая бета
 * открывается порциями, и кнопка «пригласить всех» — самый быстрый способ
 * впустить больше людей, чем платформа готова обслужить.
 */
export function WaitlistTable({
  entries,
}: {
  entries: { id: string; email: string; locale: string; source: string | null; createdAt: string }[];
}) {
  const t = useTranslations('admin.invites');
  const tRoot = useTranslations();
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function send() {
    startTransition(async () => {
      const result = await inviteFromWaitlist(selected);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      toast.success(t('sent', { count: result.sent ?? 0 }));
      setSelected([]);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={pending} disabled={selected.length === 0} onClick={send}>
          <Send aria-hidden className="size-4" />
          {t('invite', { count: selected.length })}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            setSelected(selected.length === entries.length ? [] : entries.map((entry) => entry.id))
          }
        >
          {selected.length === entries.length ? t('clearSelection') : t('selectAll')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-[var(--pf-border)]">
            {entries.map((entry) => (
              <li key={entry.id}>
                <label className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0"
                    checked={selected.includes(entry.id)}
                    onChange={() => toggle(entry.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{entry.email}</span>
                  <span className="text-xs text-fg-muted">{entry.locale.toUpperCase()}</span>
                  {entry.source ? (
                    <span className="text-xs text-fg-muted">{entry.source}</span>
                  ) : null}
                  <span className="text-xs text-fg-muted">{entry.createdAt}</span>
                </label>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

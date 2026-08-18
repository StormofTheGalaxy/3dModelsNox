'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { resolveReport } from '@/server/actions/moderation';

/**
 * Разбор жалобы модератором (§4.10).
 *
 * Подтверждение автоматически выдаёт страйк автору объекта, поэтому кнопка
 * подписана прямо: «подтвердить и выдать страйк» — а не нейтральное «принять».
 */
export function ReportActions({ reportId }: { reportId: string }) {
  const t = useTranslations('report');
  const tRoot = useTranslations();
  const router = useRouter();

  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  function resolve(confirm: boolean) {
    startTransition(async () => {
      const result = await resolveReport(reportId, confirm, note);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      if (result.banned) toast.success(t('bannedAfterStrike'));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--pf-border)] pt-3">
      <Textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t('resolutionNote')}
        aria-label={t('resolutionNote')}
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="danger" loading={pending} onClick={() => resolve(true)}>
          <Check aria-hidden className="size-4" />
          {t('confirmAndStrike')}
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => resolve(false)}>
          <X aria-hidden className="size-4" />
          {t('dismiss')}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Modal, ModalContent } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { suggestBriefField } from '@/server/actions/ai';
import { cn } from '@/lib/utils';

/**
 * «✨ ИИ подскажет» у поля (§4.4, пункт 3).
 *
 * Подсказка не применяется молча: пользователь видит значение и объяснение
 * и решает сам — иначе ИИ незаметно подменяет решения заказчика.
 */
export function FieldHint({
  briefId,
  section,
  field,
  getDraft,
  onApply,
}: {
  briefId: string;
  section: string;
  field: string;
  /** Текущее состояние конструктора: подсказка должна учитывать несохранённое. */
  getDraft: () => { title: string; sections: unknown };
  onApply: (value: string) => void;
}) {
  const t = useTranslations('brief.ai');
  const tRoot = useTranslations();
  const tCommon = useTranslations('common');

  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<{ value: string; explanation: string } | null>(null);

  function ask() {
    startTransition(async () => {
      const result = await suggestBriefField(briefId, section, field, getDraft());

      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }

      setSuggestion({ value: result.value, explanation: result.explanation });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={ask}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
          'text-accent transition-colors hover:bg-accent-soft disabled:opacity-60',
        )}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-3" aria-hidden />
        )}
        {t('suggest')}
      </button>

      <Modal open={suggestion !== null} onOpenChange={(open) => !open && setSuggestion(null)}>
        <ModalContent title={t('suggest')} closeLabel={tCommon('close')}>
          <div className="flex flex-col gap-4">
            <p className="rounded-[var(--radius-control)] bg-surface-2 px-3.5 py-3 font-mono text-sm">
              {suggestion?.value || '—'}
            </p>
            <p className="text-sm text-fg-muted">{suggestion?.explanation}</p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSuggestion(null)}>
                {tCommon('cancel')}
              </Button>
              <Button
                disabled={!suggestion?.value}
                onClick={() => {
                  if (suggestion?.value) onApply(suggestion.value);
                  setSuggestion(null);
                  toast.success(t('suggestionApplied'));
                }}
              >
                {t('apply')}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}

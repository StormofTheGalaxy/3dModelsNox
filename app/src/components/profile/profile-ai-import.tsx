'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { parseProfileText, type ParsedProfileDraft } from '@/server/actions/onboarding';

/**
 * «✨ Заполнить из портфолио» (§4.7).
 *
 * Разобранное подставляется в форму как черновик: ничего не сохраняется,
 * пока человек не проверит поля и не нажмёт «Сохранить профиль». ИИ здесь
 * экономит время на перепечатывании, а не решает за автора.
 */
export function ProfileAiImport({ onApply }: { onApply: (draft: ParsedProfileDraft) => void }) {
  const t = useTranslations('profile.aiImport');
  const tRoot = useTranslations();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, startTransition] = useTransition();

  function parse() {
    startTransition(async () => {
      const result = await parseProfileText(text);

      if (!result.ok) {
        toast.error(tRoot(result.error, result.values));
        return;
      }

      onApply(result.draft);
      setOpen(false);
      setText('');
      toast.success(t('applied'));
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" className="sm:w-fit" onClick={() => setOpen(true)}>
        <Sparkles aria-hidden className="size-4" />
        {t('button')}
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div>
          <Label htmlFor="ai-import-text">{t('label')}</Label>
          <p className="mt-1 text-sm text-fg-muted">{t('hint')}</p>
        </div>

        <Textarea
          id="ai-import-text"
          rows={6}
          value={text}
          maxLength={8000}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('placeholder')}
        />

        <Alert tone="info">{t('draftNote')}</Alert>

        <div className="flex flex-wrap gap-2">
          <Button type="button" loading={pending} disabled={text.trim().length < 80} onClick={parse}>
            <Sparkles aria-hidden className="size-4" />
            {t('parse')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {tRoot('common.cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { saveLegalDocument } from '@/server/actions/admin';
import { idleState, type ActionState } from '@/server/actions/types';

/**
 * Markdown-редактор правового документа (§4.10).
 *
 * Пока запись пуста, публичная страница показывает драфт из кода — об этом
 * сказано прямо в карточке, чтобы «пустое поле» не читалось как «документа
 * на сайте нет».
 */
export function LegalEditor({
  slug,
  locale,
  title,
  body,
  updatedBy,
}: {
  slug: string;
  locale: string;
  title: string;
  body: string;
  updatedBy: string | null;
}) {
  const t = useTranslations('admin.content');
  const tRoot = useTranslations();
  const [open, setOpen] = useState(false);

  const [, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await saveLegalDocument(previous, formData);

      if (result.status === 'success') {
        toast.success(tRoot(result.message ?? 'settings.saved'));
      } else if (result.message) {
        toast.error(tRoot(result.message, result.values));
      }

      return result;
    },
    idleState,
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            {t(`legalDocs.${slug}`)} · {locale.toUpperCase()}
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={body ? 'success' : 'warning'}>
              {body ? t('legalStored') : t('legalDraft')}
            </Badge>
            {updatedBy ? <span className="text-xs text-fg-muted">{updatedBy}</span> : null}
            <Button size="sm" variant="ghost" onClick={() => setOpen((current) => !current)}>
              {open ? tRoot('common.cancel') : t('legalEdit')}
            </Button>
          </div>
        </div>

        {open ? (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="locale" value={locale} />

            <div>
              <Label htmlFor={`legal-title-${slug}-${locale}`}>{t('legalTitle')}</Label>
              <Input
                id={`legal-title-${slug}-${locale}`}
                name="title"
                defaultValue={title}
                maxLength={200}
                required
              />
            </div>

            <div>
              <Label htmlFor={`legal-body-${slug}-${locale}`}>{t('legalBody')}</Label>
              <Textarea
                id={`legal-body-${slug}-${locale}`}
                name="body"
                rows={12}
                className="font-mono text-sm"
                defaultValue={body}
                required
              />
              <p className="mt-1 text-xs text-fg-muted">{t('legalMarkdownHint')}</p>
            </div>

            <Button type="submit" size="sm" loading={pending}>
              {t('legalSave')}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

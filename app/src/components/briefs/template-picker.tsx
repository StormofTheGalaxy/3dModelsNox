'use client';

import { FilePlus2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { createBrief } from '@/server/actions/briefs';
import { cn } from '@/lib/utils';

export interface TemplateItem {
  id: string;
  title: string;
  description: string;
  isSystem: boolean;
}

export interface BriefOwnerOption {
  id: string;
  name: string;
}

/**
 * Выбор пресета ТЗ (§4.4). Пресет создаёт ТЗ сразу и ведёт в конструктор:
 * промежуточный экран «подтвердите выбор» здесь ничего не добавляет.
 */
export function TemplatePicker({
  templates,
  blankLabel,
  blankHint,
  organizations = [],
}: {
  templates: TemplateItem[];
  blankLabel: string;
  blankHint: string;
  organizations?: BriefOwnerOption[];
}) {
  const t = useTranslations('teams');
  const tRoot = useTranslations();
  const router = useRouter();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [, startTransition] = useTransition();

  function pick(templateId?: string) {
    setPendingId(templateId ?? 'blank');

    startTransition(async () => {
      const result = await createBrief(templateId, organizationId || undefined);

      if ('error' in result) {
        toast.error(tRoot(result.error));
        setPendingId(null);
        return;
      }

      router.push(`/briefs/${result.briefId}/edit`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Выбор владельца — до выбора пресета: пресет создаёт ТЗ сразу,
          и спрашивать «а чьё оно?» после перехода в конструктор поздно. */}
      {organizations.length > 0 ? (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="brief-owner">{t('onBehalfLabel')}</Label>
          <Select
            id="brief-owner"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            <option value="">{t('onBehalfSelf')}</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-fg-muted">{t('onBehalfHint')}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => pick()} disabled={pendingId !== null} className="text-left">
          <Card
            glow
            className={cn(
              'h-full border-dashed',
              pendingId === 'blank' && 'opacity-60',
            )}
          >
            <CardContent className="flex h-full flex-col gap-2">
              <div className="flex items-center gap-2">
                {pendingId === 'blank' ? (
                  <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
                ) : (
                  <FilePlus2 className="size-4 text-accent" aria-hidden />
                )}
                <span className="font-semibold">{blankLabel}</span>
              </div>
              <p className="text-sm text-fg-muted">{blankHint}</p>
            </CardContent>
          </Card>
        </button>

        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => pick(template.id)}
            disabled={pendingId !== null}
            className="text-left"
          >
            <Card glow className={cn('h-full', pendingId === template.id && 'opacity-60')}>
              <CardContent className="flex h-full flex-col gap-2">
                <div className="flex items-center gap-2">
                  {pendingId === template.id ? (
                    <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
                  ) : null}
                  <span className="font-semibold">{template.title}</span>
                </div>
                <p className="text-sm text-fg-muted">{template.description}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

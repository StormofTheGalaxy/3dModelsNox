'use client';

import { EyeOff, FileText, Globe, Lock, Sparkles, Trash2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { ReportDialog } from '@/components/report/report-dialog';
import { Link, useRouter } from '@/i18n/navigation';
import { createBrief } from '@/server/actions/briefs';
import {
  deleteTemplate,
  hideTemplate,
  publishTemplate,
} from '@/server/actions/templates';
import { cn } from '@/lib/utils';

/**
 * Каталог шаблонов ТЗ (§4.4, post-MVP №6).
 *
 * Системные пресеты и опубликованные пользовательские в одном списке:
 * человеку нужен подходящий шаблон, а не разбирательство, чей он. Но
 * происхождение помечено — доверие к заготовке платформы и к чужой
 * разное.
 */

export interface CatalogItem {
  id: string;
  isSystem: boolean;
  title: string;
  description: string | null;
  authorNickname: string | null;
  usesCount: number;
  assetType: string | null;
  isOwn: boolean;
}

export interface OwnTemplate {
  id: string;
  title: string;
  isPublic: boolean;
  hidden: boolean;
  usesCount: number;
}

export function TemplateCatalog({
  items,
  own,
  assetTypes,
  canModerate,
  canPublish,
}: {
  items: CatalogItem[];
  own: OwnTemplate[];
  assetTypes: string[];
  canModerate: boolean;
  /** Публикация за флагом: без него список остаётся, кнопок нет. */
  canPublish: boolean;
}) {
  const t = useTranslations('briefTemplates.catalog');
  const tTax = useTranslations('taxonomy');
  const tRoot = useTranslations();
  const router = useRouter();

  const [assetType, setAssetType] = useState('');
  const [sort, setSort] = useState('popular');
  const [pending, startTransition] = useTransition();
  const [usingId, setUsingId] = useState<string | null>(null);

  const visible = items
    .filter((item) => !assetType || item.assetType === assetType)
    .sort((a, b) => {
      // Системные всегда впереди: это проверенные заготовки платформы.
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return sort === 'popular' ? b.usesCount - a.usesCount : 0;
    });

  function use(item: CatalogItem) {
    setUsingId(item.id);

    startTransition(async () => {
      const result = await createBrief(item.id);

      if ('error' in result) {
        setUsingId(null);
        toast.error(tRoot(result.error));
        return;
      }

      router.push(`/briefs/${result.briefId}/edit`);
    });
  }

  function act(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <label className="text-xs text-fg-muted" htmlFor="template-asset-type">
            {t('filterType')}
          </label>
          <Select
            id="template-asset-type"
            value={assetType}
            onChange={(event) => setAssetType(event.target.value)}
          >
            <option value="">{t('anyType')}</option>
            {assetTypes.map((value) => (
              <option key={value} value={value}>
                {tTax(`assetType.${value}`)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <label className="text-xs text-fg-muted" htmlFor="template-sort">
            {t('sort')}
          </label>
          <Select id="template-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="popular">{t('sortPopular')}</option>
            <option value="new">{t('sortNew')}</option>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={FileText} title={t('empty')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((item) => (
            <li key={item.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3">
                  {/* Плашка отдельной строкой: рядом с заголовком она
                      прыгает под него на длинных названиях, и карточки в
                      сетке перестают выравниваться. */}
                  <div className="flex flex-wrap gap-2">
                    {item.isSystem ? (
                      <Badge variant="accent">
                        <Sparkles className="size-3" aria-hidden />
                        {t('systemBadge')}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">
                        <Users className="size-3" aria-hidden />
                        {t('communityBadge')}
                      </Badge>
                    )}
                  </div>

                  <h3 className="font-semibold">{item.title}</h3>

                  {item.description ? (
                    <p className="text-sm text-fg-muted">{item.description}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    {item.assetType ? (
                      <Badge variant="outline">{tTax(`assetType.${item.assetType}`)}</Badge>
                    ) : null}

                    {item.authorNickname ? (
                      <Link
                        href={`/designers/${item.authorNickname}`}
                        className="hover:text-accent"
                      >
                        @{item.authorNickname}
                      </Link>
                    ) : null}

                    {item.usesCount > 0 ? <span>{t('uses', { count: item.usesCount })}</span> : null}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      loading={pending && usingId === item.id}
                      onClick={() => use(item)}
                    >
                      {t('use')}
                    </Button>

                    {canModerate && !item.isSystem ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() => act(() => hideTemplate(item.id), t('hidden'))}
                      >
                        <EyeOff aria-hidden />
                        {t('hide')}
                      </Button>
                    ) : null}

                    {!item.isSystem && !item.isOwn ? (
                      <ReportDialog targetType="template" targetId={item.id} />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {own.length > 0 ? (
        <section className="flex flex-col gap-3 border-t border-[var(--pf-border)] pt-6">
          <h2 className="text-lg font-bold">{t('mine')}</h2>
          <p className="text-sm text-fg-muted">{t('mineHint')}</p>

          <ul className="flex flex-col gap-2">
            {own.map((template) => (
              <li
                key={template.id}
                className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--pf-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{template.title}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    {template.hidden ? (
                      <Badge variant="danger">{t('hiddenBadge')}</Badge>
                    ) : template.isPublic ? (
                      <Badge variant="success">
                        <Globe className="size-3" aria-hidden />
                        {t('publicBadge')}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">
                        <Lock className="size-3" aria-hidden />
                        {t('privateBadge')}
                      </Badge>
                    )}
                    {template.usesCount > 0 ? t('uses', { count: template.usesCount }) : null}
                  </span>
                </div>

                <div className={cn('flex flex-wrap items-center gap-2')}>
                  {canPublish && !template.hidden ? (
                    <Button
                      size="sm"
                      variant={template.isPublic ? 'ghost' : 'secondary'}
                      loading={pending}
                      onClick={() =>
                        act(
                          () => publishTemplate(template.id, !template.isPublic),
                          template.isPublic ? t('unpublished') : t('published'),
                        )
                      }
                    >
                      {template.isPublic ? <Lock aria-hidden /> : <Globe aria-hidden />}
                      {template.isPublic ? t('unpublish') : t('publish')}
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => act(() => deleteTemplate(template.id), t('deleted'))}
                  >
                    <Trash2 aria-hidden />
                    {t('delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

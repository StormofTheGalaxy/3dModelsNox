'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { ART_STYLES, ASSET_TYPES, gallerySortOptions } from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Фильтры галереи. Состояние живёт в URL, а не в React: ссылку на подборку
 * можно отправить, а «назад» возвращает предыдущий набор фильтров.
 */
export function GalleryFilters() {
  const t = useTranslations('works.filters');
  const tTax = useTranslations('taxonomy');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const hasFilters = ['style', 'assetType', 'software'].some((key) => searchParams.get(key));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:max-w-48">
        <span className="text-xs font-medium text-fg-muted">{t('style')}</span>
        <Select
          value={searchParams.get('style') ?? ''}
          onChange={(event) => update('style', event.target.value)}
        >
          <option value="">{t('all')}</option>
          {ART_STYLES.map((style) => (
            <option key={style} value={style}>
              {tTax(`style.${style}`)}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:max-w-48">
        <span className="text-xs font-medium text-fg-muted">{t('assetType')}</span>
        <Select
          value={searchParams.get('assetType') ?? ''}
          onChange={(event) => update('assetType', event.target.value)}
        >
          <option value="">{t('all')}</option>
          {ASSET_TYPES.map((type) => (
            <option key={type} value={type}>
              {tTax(`assetType.${type}`)}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:max-w-56">
        <span className="text-xs font-medium text-fg-muted">{t('sort')}</span>
        <Select
          value={searchParams.get('sort') ?? 'new'}
          onChange={(event) => update('sort', event.target.value)}
        >
          {gallerySortOptions.map((option) => (
            <option key={option} value={option}>
              {option === 'new'
                ? t('new')
                : option === 'popular_week'
                  ? t('popularWeek')
                  : t('popularAll')}
            </option>
          ))}
        </Select>
      </label>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.replace(pathname, { scroll: false })}
          className={cn('mb-0.5')}
        >
          <X aria-hidden />
          {t('reset')}
        </Button>
      ) : null}
    </div>
  );
}

'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { ART_STYLES, AVAILABILITY_STATES, SPECIALIZATIONS } from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { usePathname, useRouter } from '@/i18n/navigation';

/** Фильтры каталога дизайнеров. Состояние — в URL, как и в галерее работ. */
export function DesignerFilters() {
  const t = useTranslations('designers.filters');
  const tWorks = useTranslations('works.filters');
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

  const hasFilters = ['specialization', 'style', 'availability', 'verified'].some((key) =>
    searchParams.get(key),
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:max-w-52">
        <span className="text-xs font-medium text-fg-muted">{t('specialization')}</span>
        <Select
          value={searchParams.get('specialization') ?? ''}
          onChange={(event) => update('specialization', event.target.value)}
        >
          <option value="">{tWorks('all')}</option>
          {SPECIALIZATIONS.map((item) => (
            <option key={item} value={item}>
              {tTax(`specialization.${item}`)}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:max-w-48">
        <span className="text-xs font-medium text-fg-muted">{t('style')}</span>
        <Select
          value={searchParams.get('style') ?? ''}
          onChange={(event) => update('style', event.target.value)}
        >
          <option value="">{tWorks('all')}</option>
          {ART_STYLES.map((item) => (
            <option key={item} value={item}>
              {tTax(`style.${item}`)}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:max-w-48">
        <span className="text-xs font-medium text-fg-muted">{t('availability')}</span>
        <Select
          value={searchParams.get('availability') ?? ''}
          onChange={(event) => update('availability', event.target.value)}
        >
          <option value="">{tWorks('all')}</option>
          {AVAILABILITY_STATES.map((item) => (
            <option key={item} value={item}>
              {tTax(`availability.${item}`)}
            </option>
          ))}
        </Select>
      </label>

      <label className="mb-3 inline-flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={searchParams.get('verified') === '1'}
          onChange={(event) => update('verified', event.target.checked ? '1' : '')}
          className="size-4 accent-[var(--pf-accent)]"
        />
        {t('verifiedOnly')}
      </label>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          className="mb-0.5"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          <X aria-hidden />
          {tWorks('reset')}
        </Button>
      ) : null}
    </div>
  );
}

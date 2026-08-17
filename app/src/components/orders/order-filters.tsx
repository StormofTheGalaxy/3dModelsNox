'use client';

import { Bookmark, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ART_STYLES, ASSET_TYPES, CURRENCIES, ORDER_SORTS } from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SaveFilterDialog } from '@/components/orders/save-filter-dialog';
import { usePathname, useRouter } from '@/i18n/navigation';

const SORT_LABEL_KEY: Record<string, string> = {
  new: 'sortNew',
  budget_desc: 'sortBudgetDesc',
  budget_asc: 'sortBudgetAsc',
  deadline: 'sortDeadline',
};

/**
 * Фильтры витрины заказов (§4.5). Как и в галерее, состояние живёт в URL:
 * подборку можно отправить ссылкой, а SSR отдаёт уже отфильтрованный экран.
 */
export function OrderFilters({ canSave }: { canSave: boolean }) {
  const t = useTranslations('orders.filters');
  const tTax = useTranslations('taxonomy');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('query') ?? '');

  function update(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const activeKeys = [
    'query',
    'assetType',
    'style',
    'engine',
    'budgetMin',
    'budgetMax',
    'currency',
    'deadlineWithinDays',
    'verified',
    'noResponses',
  ];
  const hasFilters = activeKeys.some((key) => searchParams.get(key));

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          update({ query });
        }}
        className="flex gap-2"
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          className="flex-1"
        />
        <Button type="submit" variant="secondary">
          <Search aria-hidden />
        </Button>
      </form>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-36 flex-1 flex-col gap-1.5 sm:max-w-44">
          <span className="text-xs font-medium text-fg-muted">{t('assetType')}</span>
          <Select
            value={searchParams.get('assetType') ?? ''}
            onChange={(event) => update({ assetType: event.target.value })}
          >
            <option value="">{t('all')}</option>
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {tTax(`assetType.${type}`)}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex min-w-36 flex-1 flex-col gap-1.5 sm:max-w-44">
          <span className="text-xs font-medium text-fg-muted">{t('style')}</span>
          <Select
            value={searchParams.get('style') ?? ''}
            onChange={(event) => update({ style: event.target.value })}
          >
            <option value="">{t('all')}</option>
            {ART_STYLES.map((style) => (
              <option key={style} value={style}>
                {tTax(`style.${style}`)}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex w-28 flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">{t('budgetFrom')}</span>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={searchParams.get('budgetMin') ?? ''}
            onBlur={(event) => update({ budgetMin: event.target.value })}
          />
        </label>

        <label className="flex w-28 flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">{t('budgetTo')}</span>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={searchParams.get('budgetMax') ?? ''}
            onBlur={(event) => update({ budgetMax: event.target.value })}
          />
        </label>

        <label className="flex w-28 flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">{t('currency')}</span>
          <Select
            value={searchParams.get('currency') ?? ''}
            onChange={(event) => update({ currency: event.target.value })}
          >
            <option value="">{t('all')}</option>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex min-w-36 flex-1 flex-col gap-1.5 sm:max-w-52">
          <span className="text-xs font-medium text-fg-muted">{t('sort')}</span>
          <Select
            value={searchParams.get('sort') ?? 'new'}
            onChange={(event) => update({ sort: event.target.value })}
          >
            {ORDER_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(SORT_LABEL_KEY[sort] ?? 'sortNew')}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={searchParams.get('verified') === '1'}
            onChange={(event) => update({ verified: event.target.checked ? '1' : '' })}
            className="size-4 accent-[var(--pf-accent)]"
          />
          {t('verifiedOnly')}
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={searchParams.get('noResponses') === '1'}
            onChange={(event) => update({ noResponses: event.target.checked ? '1' : '' })}
            className="size-4 accent-[var(--pf-accent)]"
          />
          {t('noResponses')}
        </label>

        {canSave ? (
          <SaveFilterDialog
            params={Object.fromEntries(searchParams.entries())}
            trigger={
              <Button variant="ghost" size="sm">
                <Bookmark aria-hidden />
              </Button>
            }
          />
        ) : null}

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              router.replace(pathname, { scroll: false });
            }}
          >
            <X aria-hidden />
            {t('reset')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

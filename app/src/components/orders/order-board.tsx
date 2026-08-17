'use client';

import { ClipboardList } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { OrderCard, type OrderCardData } from '@/components/orders/order-card';
import { loadMoreOrders } from '@/server/actions/order-board';

export interface BoardFilters {
  query?: string;
  assetType?: string;
  style?: string;
  engine?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  deadlineWithinDays?: number;
  verifiedCustomersOnly?: boolean;
  noResponsesOnly?: boolean;
  sort?: string;
}

/**
 * Лента витрины с бесконечным скроллом (§4.5).
 * Сброс при смене фильтров делает страница через `key`.
 */
export function OrderBoard({
  initialItems,
  initialCursor,
  filters,
  isFiltered,
  locale,
}: {
  initialItems: OrderCardData[];
  initialCursor: string | null;
  filters: BoardFilters;
  isFiltered: boolean;
  locale: string;
}) {
  const t = useTranslations('orders');

  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (!cursor || pending) return;

    startTransition(async () => {
      const result = await loadMoreOrders({ ...filters, cursor });
      setItems((current) => [...current, ...result.items]);
      setCursor(result.nextCursor);
    });
  }, [cursor, filters, pending]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '400px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={t('empty')}
        description={isFiltered ? t('emptyFiltered') : t('boardHint')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {items.map((order) => (
          <OrderCard key={order.id} order={order} locale={locale} />
        ))}
      </div>

      <div ref={sentinelRef} aria-hidden />

      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} loading={pending}>
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

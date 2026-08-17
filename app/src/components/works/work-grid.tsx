'use client';

import { Images } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { WorkCard, type WorkCardData } from '@/components/works/work-card';
import { loadMoreWorks } from '@/server/actions/gallery';

/**
 * Сетка галереи с бесконечным скроллом (§4.3).
 *
 * Masonry сделан CSS-колонками: JS-раскладка ради выравнивания высот стоила бы
 * пересчёта на каждый ресайз и ломала бы порядок табуляции.
 */
export function WorkGrid({
  initialItems,
  initialCursor,
  filters,
  isFiltered,
}: {
  initialItems: WorkCardData[];
  initialCursor: string | null;
  filters: { style?: string; assetType?: string; software?: string; sort?: string };
  isFiltered: boolean;
}) {
  const t = useTranslations('works');

  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Смена фильтров сбрасывает список: страница передаёт `key` от набора
  // фильтров, поэтому компонент перемонтируется с новым первым экраном,
  // и синхронизировать состояние с props не нужно.

  const loadMore = useCallback(() => {
    if (!cursor || pending) return;

    startTransition(async () => {
      const result = await loadMoreWorks({ ...filters, cursor });
      setItems((current) => [...current, ...result.items]);
      setCursor(result.nextCursor);
    });
  }, [cursor, filters, pending]);

  // Подгружаем заранее, за 400px до конца списка.
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
        icon={Images}
        title={t('empty.title')}
        description={isFiltered ? t('empty.filtered') : t('empty.text')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid">
        {items.map((work) => (
          <WorkCard key={work.id} work={work} />
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

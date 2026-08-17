'use client';

import { Eye, Heart, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface WorkCardData {
  id: string;
  title: string;
  likesCount: number;
  views: number;
  badgeOnPlatform: boolean;
  designer: { nickname: string };
  media: { url: string; thumbnailUrl: string | null; width: number | null; height: number | null }[];
}

/**
 * Карточка работы в галерее. Продукт визуально-первый (§5.1): картинка
 * занимает всё, подписи проявляются при наведении.
 *
 * Клиентский компонент — его дорисовывает бесконечный скролл галереи.
 */
export function WorkCard({ work }: { work: WorkCardData }) {
  const t = useTranslations('works');

  const cover = work.media[0];
  // Соотношение сторон из метаданных: без него masonry «прыгает»
  // по мере догрузки изображений.
  const ratio = cover?.width && cover.height ? `${cover.width} / ${cover.height}` : '4 / 3';

  return (
    <Link
      href={`/works/${work.id}`}
      className={cn(
        'group relative block overflow-hidden rounded-[var(--radius-card)]',
        'border border-[var(--pf-border)] bg-surface-2',
        'transition-all duration-200 ease-[var(--ease-out-quick)]',
        'hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow-glow)]',
      )}
    >
      <div style={{ aspectRatio: ratio }} className="w-full">
        {cover ? (
          // Файлы лежат на пользовательском CDN, а воркер уже отдал webp нужного
          // размера — оптимизатор next/image здесь ничего не добавит.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.thumbnailUrl ?? cover.url}
            alt={work.title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="size-full bg-surface-2" />
        )}
      </div>

      {work.badgeOnPlatform ? (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">
          <Sparkles className="size-3" aria-hidden />
          {t('badgeOnPlatform')}
        </span>
      ) : null}

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 pt-10',
          'bg-gradient-to-t from-black/80 to-transparent',
          'translate-y-1 opacity-0 transition-all duration-200',
          'group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{work.title}</p>
          <p className="truncate text-xs text-white/70">@{work.designer.nickname}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 text-xs text-white/80">
          <span className="inline-flex items-center gap-1" title={t('likes')}>
            <Heart className="size-3.5" aria-hidden />
            {work.likesCount}
          </span>
          <span className="inline-flex items-center gap-1" title={t('views')}>
            <Eye className="size-3.5" aria-hidden />
            {work.views}
          </span>
        </div>
      </div>
    </Link>
  );
}

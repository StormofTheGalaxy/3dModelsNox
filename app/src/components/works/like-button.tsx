'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { toggleWorkLike } from '@/server/actions/works';
import { cn } from '@/lib/utils';

/**
 * Лайк работы. Состояние меняется оптимистично: ждать сервер ради сердечка
 * незачем, а при ошибке возвращаем прежнее значение.
 */
export function LikeButton({
  workId,
  initialLiked,
  initialCount,
  canLike,
}: {
  workId: string;
  initialLiked: boolean;
  initialCount: number;
  canLike: boolean;
}) {
  const t = useTranslations('works');
  const router = useRouter();

  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  function toggle() {
    // Гостя отправляем логиниться — это точка входа в воронку регистрации.
    if (!canLike) {
      router.push('/login');
      return;
    }

    const previous = { liked, count };
    setLiked(!liked);
    setCount(count + (liked ? -1 : 1));

    startTransition(async () => {
      const result = await toggleWorkLike(workId);
      if (!result.ok) {
        setLiked(previous.liked);
        setCount(previous.count);
        return;
      }
      setLiked(result.liked);
      setCount(result.likesCount);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={t('likes')}
      className={cn(
        'inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3.5 py-2 text-sm',
        'transition-all duration-150 ease-[var(--ease-out-quick)]',
        liked
          ? 'border-[var(--pf-danger)] bg-[color-mix(in_oklab,var(--pf-danger)_12%,transparent)] text-[var(--pf-danger)]'
          : 'border-[var(--pf-border)] text-fg-muted hover:border-accent/50 hover:text-fg',
      )}
    >
      <Heart className={cn('size-4', liked && 'fill-current')} aria-hidden />
      {count}
    </button>
  );
}

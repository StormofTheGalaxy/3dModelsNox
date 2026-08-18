'use client';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import { replyToReview } from '@/server/actions/reviews';
import { idleState, type ActionState } from '@/server/actions/types';
import { formatDate } from '@/lib/utils';

export interface ReviewView {
  id: string;
  overall: number;
  sub1: number;
  sub2: number;
  sub3: number;
  text: string;
  reply: string | null;
  targetRole: string;
  publishedAt: string | null;
  author: { id: string; nickname: string } | null;
}

/**
 * Лента отзывов о человеке (§4.8).
 *
 * Ответ на отзыв доступен только адресату и только один раз: превращать
 * отзывы в переписку смысла нет, а одна реплика в свою защиту нужна.
 */
export function ReviewList({
  reviews,
  locale,
  canReplyAs,
}: {
  reviews: ReviewView[];
  locale: string;
  canReplyAs: string | null;
}) {
  const t = useTranslations('reviews');

  if (reviews.length === 0) {
    return <p className="text-sm text-fg-muted">{t('empty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((review) => (
        <li
          key={review.id}
          className="rounded-[var(--radius-card)] border border-[var(--pf-border)] p-4"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{review.author?.nickname}</span>
            <span className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((score) => (
                <Star
                  key={score}
                  aria-hidden
                  className={
                    score <= review.overall
                      ? 'size-4 fill-[var(--pf-warning)] text-[var(--pf-warning)]'
                      : 'size-4 text-fg-muted'
                  }
                />
              ))}
              <span className="sr-only">{review.overall}</span>
            </span>
          </div>

          <p className="text-sm whitespace-pre-line">{review.text}</p>

          {review.publishedAt ? (
            <time className="mt-2 block text-xs text-fg-muted" dateTime={review.publishedAt}>
              {formatDate(review.publishedAt, locale)}
            </time>
          ) : null}

          {review.reply ? (
            <div className="mt-3 border-l-2 border-accent/40 pl-3">
              <p className="text-xs text-fg-muted">{t('replyLabel')}</p>
              <p className="text-sm whitespace-pre-line">{review.reply}</p>
            </div>
          ) : canReplyAs ? (
            <ReplyForm reviewId={review.id} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ReplyForm({ reviewId }: { reviewId: string }) {
  const t = useTranslations('reviews');
  const tRoot = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await replyToReview(previous, formData);
      if (result.status === 'success') {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    idleState,
  );

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        {t('reply')}
      </Button>
    );
  }

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <Textarea name="reply" rows={3} required minLength={10} aria-label={t('reply')} />

      {state.status === 'error' && state.message ? (
        <p className="text-xs text-[var(--pf-danger)]">{tRoot(state.message, state.values)}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {t('sendReply')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {tRoot('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

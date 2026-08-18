'use client';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { REVIEW_SUBSCORES, type ReviewTargetRole } from '@polyforge/shared';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { editReview, submitReview } from '@/server/actions/reviews';
import { idleState, type ActionState } from '@/server/actions/types';
import { cn } from '@/lib/utils';

/**
 * Форма отзыва (§4.8).
 *
 * Двойное слепое: пока вторая сторона не написала свой, чужой текст не
 * показывается — об этом сказано прямо в форме, чтобы отсутствие отзыва
 * не читалось как «его не оставили».
 */
export function ReviewForm({
  dealId,
  targetRole,
  targetNickname,
  blindDays,
  existing,
}: {
  dealId: string;
  targetRole: ReviewTargetRole;
  targetNickname: string;
  blindDays: number;
  existing: {
    id: string;
    overall: number;
    sub1: number;
    sub2: number;
    sub3: number;
    text: string;
    status: string;
    editableUntil: string;
  } | null;
}) {
  const t = useTranslations('reviews');
  const tRoot = useTranslations();
  const router = useRouter();

  const [overall, setOverall] = useState(existing?.overall ?? 0);
  const [subs, setSubs] = useState<[number, number, number]>([
    existing?.sub1 ?? 0,
    existing?.sub2 ?? 0,
    existing?.sub3 ?? 0,
  ]);

  const editable = existing ? new Date(existing.editableUntil) > new Date() : true;

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = existing
        ? await editReview(previous, formData)
        : await submitReview(previous, formData);

      if (result.status === 'success') {
        if (result.message) toast.success(tRoot(result.message, result.values));
        router.refresh();
      }

      return result;
    },
    idleState,
  );

  if (existing && !editable) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <h3 className="font-bold">{t('yours')}</h3>
          <Stars value={existing.overall} readOnly onChange={() => undefined} label={t('overall')} />
          <p className="text-sm whitespace-pre-line">{existing.text}</p>
          <p className="text-xs text-fg-muted">
            {existing.status === 'published'
              ? t('publishedNote')
              : t('pendingNote', { days: blindDays })}
          </p>
        </CardContent>
      </Card>
    );
  }

  const labels = REVIEW_SUBSCORES[targetRole];

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-1 font-bold">
          {existing ? t('editTitle') : t('title', { nickname: targetNickname })}
        </h3>
        <p className="mb-4 text-sm text-fg-muted">{t('blindHint', { days: blindDays })}</p>

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="dealId" value={dealId} />
          {existing ? <input type="hidden" name="reviewId" value={existing.id} /> : null}
          <input type="hidden" name="overall" value={overall} />
          <input type="hidden" name="sub1" value={subs[0]} />
          <input type="hidden" name="sub2" value={subs[1]} />
          <input type="hidden" name="sub3" value={subs[2]} />

          <Stars value={overall} onChange={setOverall} label={t('overall')} />

          {labels.map((key, index) => (
            <Stars
              key={key}
              value={subs[index] ?? 0}
              onChange={(next) =>
                setSubs((current) => {
                  const copy = [...current] as [number, number, number];
                  copy[index] = next;
                  return copy;
                })
              }
              label={t(`subscores.${targetRole}.${key}`)}
            />
          ))}

          <div>
            <Label htmlFor="review-text">{t('text')}</Label>
            <Textarea
              id="review-text"
              name="text"
              rows={5}
              required
              minLength={20}
              maxLength={4000}
              defaultValue={existing?.text ?? ''}
              placeholder={t('textHint')}
            />
          </div>

          {state.status === 'error' && state.message ? (
            <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
          ) : null}

          <Button
            type="submit"
            loading={pending}
            disabled={overall === 0 || subs.some((score) => score === 0)}
          >
            {existing ? t('saveEdit') : t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Оценка звёздами. Радиогруппа, а не набор кнопок: это выбор одного из пяти. */
function Stars({
  value,
  onChange,
  label,
  readOnly = false,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* Подпись сжимается, звёзды — нет: иначе на узком экране их SVG
          наезжают друг на друга и попасть по нужной невозможно. */}
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <div
        className="flex shrink-0 gap-1"
        role={readOnly ? undefined : 'radiogroup'}
        aria-label={label}
      >
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            role={readOnly ? undefined : 'radio'}
            aria-checked={readOnly ? undefined : value === score}
            aria-label={String(score)}
            disabled={readOnly}
            onClick={() => onChange(score)}
            // Подсветка вместо увеличения: растущая под курсором звезда
            // уезжает из-под нажатия — на тач-экране это заметный промах.
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150',
              readOnly ? 'cursor-default' : 'hover:bg-surface-2',
            )}
          >
            <Star
              aria-hidden
              className={cn(
                'size-6',
                score <= value
                  ? 'fill-[var(--pf-warning)] text-[var(--pf-warning)]'
                  : 'text-fg-muted',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

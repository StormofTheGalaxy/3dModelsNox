'use client';

import type { BriefEstimate, BriefReview } from '@polyforge/ai';
import { AlertTriangle, CircleCheck, Info, Sparkles, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { estimateBriefWithAI, reviewBriefWithAI } from '@/server/actions/ai';
import { cn } from '@/lib/utils';

/**
 * Панели «✨ Проверить ТЗ» и «✨ Оценка бюджета и сроков» (§4.4, пункты 2 и 4).
 */

type Draft = { title: string; sections: unknown };

const SEVERITY_ICON = {
  gap: Info,
  conflict: TriangleAlert,
  hint: Sparkles,
} as const;

const SEVERITY_TONE = {
  gap: 'warning',
  conflict: 'danger',
  hint: 'neutral',
} as const;

export function BriefAITools({
  briefId,
  getDraft,
  onApplySuggestion,
  isLive,
}: {
  briefId: string;
  getDraft: () => Draft;
  /** Подстановка значения из замечания в поле конструктора. */
  onApplySuggestion: (section: string, field: string, value: string) => void;
  isLive: boolean;
}) {
  const t = useTranslations('brief.ai');
  const tRoot = useTranslations();

  const [review, setReview] = useState<BriefReview | null>(null);
  const [estimate, setEstimate] = useState<BriefEstimate | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [reviewPending, startReview] = useTransition();
  const [estimatePending, startEstimate] = useTransition();

  function runReview() {
    startReview(async () => {
      const result = await reviewBriefWithAI(briefId, getDraft());

      if (!result.ok) {
        toast.error(tRoot(result.error, result.values));
        return;
      }

      setReview(result.review);
      setCredits(result.meta.left);
    });
  }

  function runEstimate() {
    startEstimate(async () => {
      const result = await estimateBriefWithAI(briefId, getDraft());

      if (!result.ok) {
        toast.error(tRoot(result.error, result.values));
        return;
      }

      setEstimate(result.estimate);
      setCredits(result.meta.left);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Пользователь должен знать, что перед ним не модель, а заглушка. */}
      {!isLive ? <Alert tone="warning">{t('stubWarning')}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" loading={reviewPending} onClick={runReview}>
          <Sparkles aria-hidden />
          {t('review')}
        </Button>

        <Button variant="secondary" size="sm" loading={estimatePending} onClick={runEstimate}>
          <Sparkles aria-hidden />
          {t('estimate')}
        </Button>

        {credits !== null ? (
          <span className="text-xs text-fg-muted">{t('creditsLeft', { left: credits })}</span>
        ) : null}
      </div>

      {review ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{t('reviewTitle')}</h3>
              <Badge variant={review.score >= 75 ? 'success' : review.score >= 45 ? 'warning' : 'danger'}>
                {t('reviewScore', { score: review.score })}
              </Badge>
            </div>

            <p className="text-sm text-fg-muted">{review.summary}</p>

            {review.issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-[var(--pf-success)]">
                <CircleCheck className="size-4" aria-hidden />
                {t('reviewClean')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {review.issues.map((issue, index) => {
                  const Icon = SEVERITY_ICON[issue.severity] ?? AlertTriangle;
                  return (
                    <li
                      key={`${issue.section}-${issue.field ?? index}`}
                      className={cn(
                        'flex flex-wrap items-start gap-2.5 rounded-[var(--radius-control)]',
                        'border border-[var(--pf-border)] px-3.5 py-3 text-sm',
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />

                      <div className="min-w-0 flex-1">
                        <p>{issue.message}</p>
                        <p className="mt-1 text-xs text-fg-muted">
                          {t(`severity.${issue.severity}`)} · {issue.section}
                          {issue.field ? ` · ${issue.field}` : ''}
                        </p>
                      </div>

                      <Badge variant={SEVERITY_TONE[issue.severity] ?? 'neutral'}>
                        {t(`severity.${issue.severity}`)}
                      </Badge>

                      {/* Кнопка «исправить поле» из ТЗ: подставляет предложение. */}
                      {issue.suggestion && issue.field ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onApplySuggestion(issue.section, issue.field!, issue.suggestion!)
                          }
                        >
                          {t('apply')}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {estimate ? (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <h3 className="font-semibold">{t('estimateTitle')}</h3>

            <p className="font-mono text-lg">
              {t('estimateBudget', {
                min: estimate.budgetMin,
                max: estimate.budgetMax,
                currency: estimate.currency,
              })}
            </p>
            <p className="font-mono text-sm text-fg-muted">
              {t('estimateDays', { min: estimate.daysMin, max: estimate.daysMax })}
            </p>

            <p className="text-sm text-fg-muted">{estimate.rationale}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

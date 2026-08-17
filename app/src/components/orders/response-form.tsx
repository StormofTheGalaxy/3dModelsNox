'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';

import { CURRENCIES } from '@polyforge/shared';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { FormMessage } from '@/components/forms/form-message';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { improveResponseText, submitResponse } from '@/server/actions/responses';
import { idleState } from '@/server/actions/types';
import { cn } from '@/lib/utils';

export interface PortfolioOption {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

/**
 * Отклик на заказ (§4.5): письмо, своя цена, срок и одна-три работы.
 */
export function ResponseForm({
  orderId,
  works,
  limit,
  defaultCurrency,
}: {
  orderId: string;
  works: PortfolioOption[];
  limit: { left: number; limit: number };
  defaultCurrency: string;
}) {
  const t = useTranslations('orders.response');
  const tRoot = useTranslations();

  const [coverText, setCoverText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [improving, startImprove] = useTransition();

  const [state, formAction, pending] = useActionState(submitResponse, idleState);
  useActionRedirect(state);

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tRoot(key) : undefined;
  };

  function toggleWork(workId: string) {
    setSelected((current) =>
      current.includes(workId)
        ? current.filter((id) => id !== workId)
        : current.length >= 3
          ? current
          : [...current, workId],
    );
  }

  function improve() {
    startImprove(async () => {
      const result = await improveResponseText(coverText);

      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }

      setCoverText(result.text);
      toast.success(t('improved'));
    });
  }

  if (limit.left <= 0) {
    return <Alert tone="warning">{t('limitReached')}</Alert>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-fg-muted">
          {t('limitLeft', { left: limit.left, limit: limit.limit })}
        </p>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="attachedWorkIds" value={JSON.stringify(selected)} />

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="response-cover">{t('coverText')}</Label>

              {/* ИИ правит написанное, но не пишет за автора (§4.5). */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={improving}
                disabled={coverText.trim().length < 30}
                onClick={improve}
              >
                <Sparkles aria-hidden />
                {t('improve')}
              </Button>
            </div>

            <Textarea
              id="response-cover"
              name="coverText"
              rows={6}
              required
              minLength={30}
              maxLength={3000}
              value={coverText}
              onChange={(event) => setCoverText(event.target.value)}
              placeholder={t('coverHint')}
              invalid={Boolean(fieldError('coverText'))}
            />

            {fieldError('coverText') ? (
              <p className="text-sm text-[var(--pf-danger)]">{fieldError('coverText')}</p>
            ) : (
              <p className="text-xs text-fg-muted">{t('improveHint')}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('price')} error={fieldError('price')} required>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  name="price"
                  type="number"
                  min={1}
                  required
                  inputMode="numeric"
                  className="font-mono"
                  invalid={invalid}
                />
              )}
            </Field>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="response-currency">{t('price')}</Label>
              <Select id="response-currency" name="currency" defaultValue={defaultCurrency}>
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </div>

            <Field label={t('days')} error={fieldError('days')} required>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  name="days"
                  type="number"
                  min={1}
                  max={365}
                  required
                  inputMode="numeric"
                  className="font-mono"
                  invalid={invalid}
                />
              )}
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('attachWorks')}</Label>
            <p className="text-xs text-fg-muted">{t('attachWorksHint')}</p>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {works.map((work) => {
                const active = selected.includes(work.id);
                return (
                  <button
                    key={work.id}
                    type="button"
                    onClick={() => toggleWork(work.id)}
                    aria-pressed={active}
                    className={cn(
                      'relative aspect-4/3 overflow-hidden rounded-[var(--radius-control)] border',
                      'transition-all duration-150',
                      active
                        ? 'border-accent shadow-[var(--shadow-glow)]'
                        : 'border-[var(--pf-border)] opacity-70 hover:opacity-100',
                    )}
                  >
                    {work.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={work.thumbnailUrl} alt={work.title} className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center bg-surface-2 p-1 text-[10px]">
                        {work.title}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {fieldError('attachedWorkIds') ? (
              <p className="text-sm text-[var(--pf-danger)]">{fieldError('attachedWorkIds')}</p>
            ) : null}
          </div>

          <FormMessage state={state} />

          <Button type="submit" size="lg" loading={pending} className="sm:w-fit">
            {t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

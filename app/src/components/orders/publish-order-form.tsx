'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { CURRENCIES } from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormMessage } from '@/components/forms/form-message';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { publishOrder } from '@/server/actions/orders';
import { idleState } from '@/server/actions/types';

/** Публикация заказа по готовому ТЗ (§4.5). */
export function PublishOrderForm({
  briefs,
  preselectedBriefId,
}: {
  briefs: { id: string; title: string }[];
  preselectedBriefId: string | null;
}) {
  const t = useTranslations('orders.publishForm');
  const tRoot = useTranslations();

  const [budgetMode, setBudgetMode] = useState<'fixed' | 'open'>('open');
  const [state, formAction, pending] = useActionState(publishOrder, idleState);
  useActionRedirect(state);

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tRoot(key) : undefined;
  };

  const defaultBrief =
    preselectedBriefId && briefs.some((brief) => brief.id === preselectedBriefId)
      ? preselectedBriefId
      : briefs[0]?.id;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-brief">{t('chooseBrief')}</Label>
            <Select id="order-brief" name="briefId" defaultValue={defaultBrief} required>
              {briefs.map((brief) => (
                <option key={brief.id} value={brief.id}>
                  {brief.title}
                </option>
              ))}
            </Select>
            <p className="text-xs text-fg-muted">{t('chooseBriefHint')}</p>
          </div>

          <Field label={t('title')} hint={t('titleHint')} error={fieldError('title')} required>
            {({ id, invalid, describedBy }) => (
              <Input
                id={id}
                name="title"
                required
                minLength={5}
                maxLength={140}
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-budget-mode">{t('budget')}</Label>
              <Select
                id="order-budget-mode"
                name="budgetMode"
                value={budgetMode}
                onChange={(event) => setBudgetMode(event.target.value as 'fixed' | 'open')}
              >
                <option value="open">{t('budgetOpen')}</option>
                <option value="fixed">{t('budgetFixed')}</option>
              </Select>
            </div>

            {budgetMode === 'fixed' ? (
              <>
                <Field label={t('budgetAmount')} error={fieldError('budgetAmount')} required>
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      name="budgetAmount"
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
                  <Label htmlFor="order-currency">{t('budgetAmount')}</Label>
                  <Select id="order-currency" name="budgetCurrency" defaultValue="USD">
                    {CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            ) : null}
          </div>

          {/* Заказы «бесплатно» и «за отзыв» запрещены правилами (§4.5). */}
          <p className="text-xs text-fg-muted">{t('budgetHint')}</p>

          <div className="flex flex-col gap-1.5 sm:max-w-52">
            <Label htmlFor="order-deadline">{t('deadline')}</Label>
            <Input id="order-deadline" name="deadline" type="date" />
          </div>
        </CardContent>
      </Card>

      <FormMessage state={state} />

      <Button type="submit" size="lg" loading={pending} className="sm:w-fit">
        {t('submit')}
      </Button>
    </form>
  );
}

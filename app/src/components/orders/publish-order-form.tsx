'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { AUCTION_MODES, CURRENCIES } from '@polyforge/shared';

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
  auctionEnabled,
}: {
  briefs: { id: string; title: string }[];
  preselectedBriefId: string | null;
  /** Торги — post-MVP за флагом: при выключенном флаге выбора режима нет. */
  auctionEnabled: boolean;
}) {
  const t = useTranslations('orders.publishForm');
  const tAuction = useTranslations('orders.auction');
  const tRoot = useTranslations();

  const [budgetMode, setBudgetMode] = useState<'fixed' | 'open'>('open');
  const [workMode, setWorkMode] = useState<'fixed' | 'auction'>('fixed');
  const [auctionMode, setAuctionMode] = useState<'open_reverse' | 'sealed'>('open_reverse');
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
                  <Label htmlFor="order-currency">{t('currency')}</Label>
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

      {auctionEnabled ? (
        <Card>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-work-mode">{tAuction('workMode')}</Label>
              <Select
                id="order-work-mode"
                name="workMode"
                value={workMode}
                onChange={(event) => setWorkMode(event.target.value as 'fixed' | 'auction')}
              >
                <option value="fixed">{tAuction('workModeFixed')}</option>
                <option value="auction">{tAuction('workModeAuction')}</option>
              </Select>
              <p className="text-xs text-fg-muted">{tAuction('workModeHint')}</p>
            </div>

            {workMode === 'auction' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="order-auction-mode">{tAuction('modeLabel')}</Label>
                  <Select
                    id="order-auction-mode"
                    name="auctionMode"
                    value={auctionMode}
                    onChange={(event) =>
                      setAuctionMode(event.target.value as 'open_reverse' | 'sealed')
                    }
                  >
                    {AUCTION_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {tAuction(`mode.${mode}`)}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-fg-muted">{tAuction(`modeHint.${auctionMode}`)}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={tAuction('startPrice')}
                    hint={tAuction('startPriceOptional')}
                    error={fieldError('auctionStartPrice')}
                  >
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        name="auctionStartPrice"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        className="font-mono"
                        invalid={invalid}
                      />
                    )}
                  </Field>

                  <Field
                    label={tAuction('endsAt')}
                    /* Закрытым ставкам дедлайн обязателен: без него нечем
                       запустить вскрытие. */
                    hint={
                      auctionMode === 'sealed'
                        ? tAuction('endsAtRequiredSealed')
                        : tAuction('endsAtOptional')
                    }
                    error={fieldError('auctionEndsAt')}
                    required={auctionMode === 'sealed'}
                  >
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        name="auctionEndsAt"
                        type="datetime-local"
                        required={auctionMode === 'sealed'}
                        invalid={invalid}
                      />
                    )}
                  </Field>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <FormMessage state={state} />

      <Button type="submit" size="lg" loading={pending} className="sm:w-fit">
        {t('submit')}
      </Button>
    </form>
  );
}

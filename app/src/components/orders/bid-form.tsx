'use client';

import { Gavel, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import { placeBid, withdrawBid } from '@/server/actions/auctions';
import { idleState } from '@/server/actions/types';

/**
 * Ставка дизайнера в торгах (§3).
 *
 * Форма намеренно короткая: аукцион — про цену и срок. Развёрнутое письмо
 * пишут в отклике на обычный заказ, здесь для него есть одна строка примечания.
 */
export function BidForm({
  orderId,
  currency,
  startPrice,
  ownBid,
  maxUndercut,
  bidsLeft,
}: {
  orderId: string;
  currency: string;
  startPrice: number | null;
  ownBid: { amount: number; days: number | null } | null;
  /** Наибольшая сумма, с которой примут новую ставку, если своя уже есть. */
  maxUndercut: number | null;
  bidsLeft: number;
}) {
  const t = useTranslations('orders.auction');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();

  const [state, formAction, pending] = useActionState(placeBid, idleState);
  const [withdrawing, startWithdraw] = useTransition();
  const [amount, setAmount] = useState('');

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tRoot(key) : undefined;
  };

  function withdraw() {
    startWithdraw(async () => {
      const result = await withdrawBid(orderId);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      toast.success(t('bidWithdrawn'));
      router.refresh();
    });
  }

  if (bidsLeft <= 0) {
    return <Alert tone="warning">{t('noBidsLeft')}</Alert>;
  }

  // Потолок для этой конкретной ставки: стартовая цена, а после первой
  // своей ставки — шаг вниз от неё.
  const ceiling = maxUndercut ?? startPrice;
  const tooHigh = ceiling !== null && amount !== '' && Number(amount) > ceiling;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="currency" value={currency} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('yourAmount', { currency })}
          hint={
            ceiling !== null
              ? ownBid
                ? t('undercutHint', { amount: ceiling, currency })
                : t('startPriceHint', { amount: ceiling, currency })
              : undefined
          }
          error={fieldError('amount') ?? (tooHigh ? t('aboveCeiling') : undefined)}
          required
        >
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              name="amount"
              type="number"
              min={1}
              max={ceiling ?? undefined}
              required
              inputMode="numeric"
              className="font-mono"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              invalid={invalid || tooHigh}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <Field label={t('yourDays')} error={fieldError('days')} required>
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
              defaultValue={ownBid?.days ?? undefined}
              invalid={invalid}
            />
          )}
        </Field>
      </div>

      <Field label={t('comment')} hint={t('commentHint')} error={fieldError('comment')}>
        {({ id, describedBy }) => (
          <Textarea id={id} name="comment" rows={2} maxLength={600} aria-describedby={describedBy} />
        )}
      </Field>

      <FormMessage state={state} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} disabled={tooHigh}>
          <Gavel aria-hidden />
          {ownBid ? t('lowerBid') : t('placeBid')}
        </Button>

        {ownBid ? (
          <Button type="button" variant="ghost" loading={withdrawing} onClick={withdraw}>
            <Undo2 aria-hidden />
            {t('withdraw')}
          </Button>
        ) : null}

        <span className="text-xs text-fg-muted">{t('bidsLeft', { count: bidsLeft })}</span>
      </div>

      <p className="text-xs text-fg-muted">{tCommon('nonBindingNote')}</p>
    </form>
  );
}

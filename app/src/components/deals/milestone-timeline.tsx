'use client';

import { AlertTriangle, Check, Clock, Lock, Upload, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';

import { PAYMENT_METHODS } from '@polyforge/shared';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Modal, ModalContent } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { MILESTONE_STATUS_TONE } from '@/components/deals/status';
import type { DealSummary, MilestoneDetails, MilestoneView } from '@/components/deals/types';
import {
  acceptMilestone,
  claimPayment,
  confirmPayment,
  requestRevision,
  submitDelivery,
} from '@/server/actions/milestones';
import { idleState, type ActionState } from '@/server/actions/types';
import { formatDate } from '@/lib/utils';
import type { MilestoneStatus } from '@polyforge/shared';

/**
 * Таймлайн этапов (§4.6).
 *
 * Каждый этап показывает ровно одно следующее действие для текущей стороны:
 * когда на экране висят все кнопки сразу, стороны жмут не то и спорят потом
 * о том, что имелось в виду.
 */
export function MilestoneTimeline({
  locale,
  role,
  deal,
  milestones,
  details,
  sourcesUnlocked,
}: {
  locale: string;
  role: 'customer' | 'designer' | 'staff';
  deal: DealSummary;
  milestones: MilestoneView[];
  details: MilestoneDetails[];
  sourcesUnlocked: boolean;
}) {
  const t = useTranslations('deals.milestones');
  const tRoot = useTranslations();
  const router = useRouter();

  const [pendingId, startTransition] = useTransition();
  const [deliveryFor, setDeliveryFor] = useState<MilestoneView | null>(null);
  const [revisionFor, setRevisionFor] = useState<MilestoneView | null>(null);
  const [paymentFor, setPaymentFor] = useState<MilestoneView | null>(null);

  const frozen = deal.status !== 'active';

  function accept(milestoneId: string) {
    startTransition(async () => {
      const result = await acceptMilestone(milestoneId);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  function confirmReceipt(paymentId: string) {
    startTransition(async () => {
      const result = await confirmPayment(paymentId);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      if (result.dealCompleted) toast.success(t('dealCompleted'));
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold">{t('title')}</h2>

          {!sourcesUnlocked && role === 'customer' ? (
            <Alert tone="info">
              <span className="flex items-center gap-1.5">
                <Lock aria-hidden className="size-4" />
                {t('sourcesLocked')}
              </span>
            </Alert>
          ) : null}

          <ol className="flex flex-col gap-3">
            {milestones.map((milestone) => {
              const detail = details.find((entry) => entry.milestoneId === milestone.id);
              const claimed = detail?.payments.find((payment) => payment.status !== 'confirmed');
              const roundsLeft = deal.revisionRoundsIncluded - milestone.revisionRoundsUsed;

              return (
                <li
                  key={milestone.id}
                  className="rounded-[var(--radius-card)] border border-[var(--pf-border)] p-4"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <span className="font-medium">
                      {milestone.position}. {milestone.title}
                    </span>
                    <Badge variant={MILESTONE_STATUS_TONE[milestone.status as MilestoneStatus]}>
                      {t(`status.${milestone.status}`)}
                    </Badge>
                  </div>

                  <p className="text-sm text-fg-muted">
                    {milestone.amount.toLocaleString(locale)} {milestone.currency}
                    {milestone.dueDate ? (
                      <>
                        {' · '}
                        <span className={milestone.wasLate ? 'text-[var(--pf-warning)]' : undefined}>
                          <Clock aria-hidden className="inline size-3.5" />{' '}
                          {formatDate(milestone.dueDate, locale)}
                        </span>
                      </>
                    ) : null}
                    {milestone.revisionRoundsUsed > 0
                      ? ` · ${t('roundsUsed', {
                          used: milestone.revisionRoundsUsed,
                          included: deal.revisionRoundsIncluded,
                        })}`
                      : null}
                  </p>

                  {milestone.description ? (
                    <p className="mt-2 text-sm whitespace-pre-line">{milestone.description}</p>
                  ) : null}

                  {frozen ? null : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {role === 'designer' &&
                      (milestone.status === 'in_work' || milestone.status === 'revision') ? (
                        <Button size="sm" onClick={() => setDeliveryFor(milestone)}>
                          <Upload aria-hidden className="size-4" />
                          {t('actions.submit')}
                        </Button>
                      ) : null}

                      {role === 'customer' && milestone.status === 'submitted' ? (
                        <>
                          <Button
                            size="sm"
                            loading={Boolean(pendingId)}
                            onClick={() => accept(milestone.id)}
                          >
                            <Check aria-hidden className="size-4" />
                            {t('actions.accept')}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRevisionFor(milestone)}
                          >
                            {roundsLeft > 0
                              ? t('actions.revision', { left: roundsLeft })
                              : t('actions.revisionOverLimit')}
                          </Button>
                        </>
                      ) : null}

                      {role === 'customer' && milestone.status === 'accepted' ? (
                        <Button size="sm" onClick={() => setPaymentFor(milestone)}>
                          <Wallet aria-hidden className="size-4" />
                          {t('actions.pay')}
                        </Button>
                      ) : null}

                      {role === 'designer' && milestone.status === 'paid_claimed' && claimed ? (
                        <Button
                          size="sm"
                          loading={Boolean(pendingId)}
                          onClick={() => confirmReceipt(claimed.id)}
                        >
                          <Check aria-hidden className="size-4" />
                          {t('actions.confirmPayment')}
                        </Button>
                      ) : null}

                      {role === 'customer' && milestone.status === 'paid_claimed' ? (
                        <span className="flex items-center gap-1.5 text-sm text-fg-muted">
                          <AlertTriangle aria-hidden className="size-4" />
                          {t('waitingConfirmation')}
                        </span>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {deliveryFor ? (
        <DeliveryDialog milestone={deliveryFor} onClose={() => setDeliveryFor(null)} />
      ) : null}

      {revisionFor ? (
        <RevisionDialog
          milestone={revisionFor}
          roundsLeft={deal.revisionRoundsIncluded - revisionFor.revisionRoundsUsed}
          onClose={() => setRevisionFor(null)}
        />
      ) : null}

      {paymentFor ? (
        <PaymentDialog milestone={paymentFor} onClose={() => setPaymentFor(null)} />
      ) : null}
    </>
  );
}

/** Сдача этапа: файлы плюс комментарий. Версия считается сервером. */
function DeliveryDialog({
  milestone,
  onClose,
}: {
  milestone: MilestoneView;
  onClose: () => void;
}) {
  const t = useTranslations('deals.milestones.delivery');
  const tRoot = useTranslations();
  const router = useRouter();
  // Тост и закрытие — реакция на отправку формы, а не эффект рендера.
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await submitDelivery(previous, formData);

      if (result.status === 'success') {
        if (result.message) toast.success(tRoot(result.message, result.values));
        onClose();
        router.refresh();
      }

      return result;
    },
    idleState,
  );

  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onClose())}>
      <ModalContent title={t('title', { milestone: milestone.title })}>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="milestoneId" value={milestone.id} />

          <div>
            <Label htmlFor="delivery-files">{t('files')}</Label>
            <Input id="delivery-files" name="files" type="file" multiple required />
            <p className="mt-1 text-xs text-fg-muted">{t('filesHint')}</p>
          </div>

          <div>
            <Label htmlFor="delivery-note">{t('note')}</Label>
            <Textarea id="delivery-note" name="note" rows={3} maxLength={2000} />
          </div>

          {state.status === 'error' && state.message ? (
            <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
          ) : null}

          <Button type="submit" loading={pending}>
            {t('submit')}
          </Button>
        </form>
      </ModalContent>
    </Modal>
  );
}

/** Правки. Раунд списывается сразу — об этом сказано прямо в диалоге. */
function RevisionDialog({
  milestone,
  roundsLeft,
  onClose,
}: {
  milestone: MilestoneView;
  roundsLeft: number;
  onClose: () => void;
}) {
  const t = useTranslations('deals.milestones.revision');
  const tRoot = useTranslations();
  const router = useRouter();
  // Тост и закрытие — реакция на отправку формы, а не эффект рендера.
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await requestRevision(previous, formData);

      if (result.status === 'success') {
        if (result.message) toast.success(tRoot(result.message, result.values));
        onClose();
        router.refresh();
      }

      return result;
    },
    idleState,
  );

  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onClose())}>
      <ModalContent title={t('title', { milestone: milestone.title })}>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="milestoneId" value={milestone.id} />

          {roundsLeft > 0 ? (
            <Alert tone="info">{t('roundsLeft', { left: roundsLeft })}</Alert>
          ) : (
            <Alert tone="warning">{t('overLimit')}</Alert>
          )}

          <div>
            <Label htmlFor="revision-comment">{t('comment')}</Label>
            <Textarea id="revision-comment" name="comment" rows={4} required minLength={10} />
          </div>

          {state.status === 'error' && state.message ? (
            <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
          ) : null}

          <Button type="submit" loading={pending}>
            {t('submit')}
          </Button>
        </form>
      </ModalContent>
    </Modal>
  );
}

/** Заявление об оплате: сумма, способ, чек. Деньги идут мимо платформы. */
function PaymentDialog({
  milestone,
  onClose,
}: {
  milestone: MilestoneView;
  onClose: () => void;
}) {
  const t = useTranslations('deals.milestones.payment');
  const tRoot = useTranslations();
  const router = useRouter();
  // Тост и закрытие — реакция на отправку формы, а не эффект рендера.
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await claimPayment(previous, formData);

      if (result.status === 'success') {
        if (result.message) toast.success(tRoot(result.message, result.values));
        onClose();
        router.refresh();
      }

      return result;
    },
    idleState,
  );

  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onClose())}>
      <ModalContent title={t('title', { milestone: milestone.title })}>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="milestoneId" value={milestone.id} />
          <input type="hidden" name="currency" value={milestone.currency} />

          <Alert tone="info">{t('disclaimer')}</Alert>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="payment-amount">{t('amount', { currency: milestone.currency })}</Label>
              <Input
                id="payment-amount"
                name="amount"
                type="number"
                min={1}
                defaultValue={milestone.amount}
                required
              />
            </div>

            <div>
              <Label htmlFor="payment-method">{t('method')}</Label>
              <Select id="payment-method" name="method" defaultValue="other">
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {tRoot(`deals.paymentMethods.${method}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="payment-tx">{t('txHash')}</Label>
            <Input id="payment-tx" name="txHash" maxLength={120} />
          </div>

          <div>
            <Label htmlFor="payment-files">{t('receipt')}</Label>
            <Input id="payment-files" name="files" type="file" multiple required />
          </div>

          <div>
            <Label htmlFor="payment-note">{t('note')}</Label>
            <Textarea id="payment-note" name="note" rows={2} maxLength={500} />
          </div>

          {state.status === 'error' && state.message ? (
            <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
          ) : null}

          <Button type="submit" loading={pending}>
            {t('submit')}
          </Button>
        </form>
      </ModalContent>
    </Modal>
  );
}

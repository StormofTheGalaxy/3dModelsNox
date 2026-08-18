'use client';

import { FileWarning, Gavel, Pause, Play, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { Modal, ModalContent } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import type { DealChangeRequest, DealSummary } from '@/components/deals/types';
import { cancelDeal, setPortfolioPermission, toggleDealPause } from '@/server/actions/deals';
import { requestBriefChange, resolveBriefChange } from '@/server/actions/deal-chat';
import { openDispute } from '@/server/actions/disputes';
import { idleState, type ActionState } from '@/server/actions/types';

/**
 * Действия над сделкой целиком (§4.6): пауза, отмена, спор, запрос правки
 * замороженного ТЗ и разрешение показать работу в портфолио.
 *
 * Всё, кроме спора, — по обоюдному согласию; спор односторонний, потому что
 * согласия в нём по определению нет.
 */
export function DealActions({
  role,
  deal,
  changeRequests,
  viewerId,
}: {
  role: 'customer' | 'designer' | 'staff';
  deal: DealSummary;
  changeRequests: DealChangeRequest[];
  viewerId: string;
}) {
  const t = useTranslations('deals.actions');
  const tRoot = useTranslations();
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [reason, setReason] = useState('');
  // Чекбокс отвечает сразу, не дожидаясь ответа сервера: иначе он выглядит
  // сломанным. При ошибке значение возвращается на место.
  const [portfolioAllowed, setPortfolioAllowed] = useState(deal.portfolioAllowed);

  if (role === 'staff') {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-fg-muted">{t('staffView')}</CardContent>
      </Card>
    );
  }

  const closed = deal.status === 'completed' || deal.status === 'cancelled';
  const inDispute = deal.status === 'in_dispute';

  function pause() {
    startTransition(async () => {
      const result = await toggleDealPause(deal.id, reason);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      setPauseOpen(false);
      setReason('');
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelDeal(deal.id, reason);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      setCancelOpen(false);
      router.refresh();
    });
  }

  function togglePortfolio(allowed: boolean) {
    setPortfolioAllowed(allowed);

    startTransition(async () => {
      const result = await setPortfolioPermission(deal.id, allowed);
      if (!result.ok) {
        setPortfolioAllowed(!allowed);
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  function resolveChange(requestId: string, accept: boolean) {
    startTransition(async () => {
      const result = await resolveBriefChange(requestId, accept);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-bold">{t('title')}</h2>

        {deal.status === 'paused' && deal.pauseReason ? (
          <Alert tone="warning">{t('pausedWithReason', { reason: deal.pauseReason })}</Alert>
        ) : null}

        {inDispute && deal.dispute ? (
          <Alert tone="danger">{t('disputeOpen', { reason: deal.dispute.reason })}</Alert>
        ) : null}

        {deal.status === 'completed' && role === 'customer' ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-2 p-3">
            <p className="text-sm">{t('portfolioQuestion')}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={portfolioAllowed}
                disabled={pending}
                onChange={(event) => togglePortfolio(event.target.checked)}
              />
              {t('portfolioAllow')}
            </label>
          </div>
        ) : null}

        {changeRequests.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('changeRequests')}</h3>
            {changeRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-[var(--radius-control)] border border-[var(--pf-border)] p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-fg-muted">{request.author?.nickname}</span>
                  <Badge variant={request.status === 'pending' ? 'warning' : 'neutral'}>
                    {t(`changeStatus.${request.status}`)}
                  </Badge>
                </div>
                <p className="text-sm whitespace-pre-line">{request.description}</p>

                {request.status === 'pending' && request.authorId !== viewerId ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" loading={pending} onClick={() => resolveChange(request.id, true)}>
                      {t('changeAccept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={pending}
                      onClick={() => resolveChange(request.id, false)}
                    >
                      {t('changeReject')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {closed ? null : (
          <div className="flex flex-wrap gap-2">
            {!inDispute && (deal.status === 'active' || deal.status === 'paused') ? (
              <Button size="sm" variant="secondary" onClick={() => setPauseOpen(true)}>
                {deal.status === 'paused' ? (
                  <Play aria-hidden className="size-4" />
                ) : (
                  <Pause aria-hidden className="size-4" />
                )}
                {deal.status === 'paused' ? t('resume') : t('pause')}
              </Button>
            ) : null}

            {!inDispute ? (
              <Button size="sm" variant="secondary" onClick={() => setChangeOpen(true)}>
                <FileWarning aria-hidden className="size-4" />
                {t('requestChange')}
              </Button>
            ) : null}

            {!inDispute ? (
              <Button size="sm" variant="secondary" onClick={() => setDisputeOpen(true)}>
                <Gavel aria-hidden className="size-4" />
                {t('openDispute')}
              </Button>
            ) : null}

            {!inDispute ? (
              <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)}>
                <X aria-hidden className="size-4" />
                {t('cancel')}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>

      <Modal open={pauseOpen} onOpenChange={setPauseOpen}>
        <ModalContent
          title={deal.status === 'paused' ? t('resume') : t('pause')}
          description={t('pauseDescription')}
        >
          <div className="flex flex-col gap-4">
            {deal.status === 'paused' ? null : (
              <div>
                <Label htmlFor="pause-reason">{t('reason')}</Label>
                <Textarea
                  id="pause-reason"
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            )}
            <Button loading={pending} onClick={pause}>
              {deal.status === 'paused' ? t('resume') : t('pause')}
            </Button>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={cancelOpen} onOpenChange={setCancelOpen}>
        <ModalContent title={t('cancel')} description={t('cancelDescription')}>
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="cancel-reason">{t('reason')}</Label>
              <Textarea
                id="cancel-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button variant="danger" loading={pending} onClick={cancel}>
              {t('cancel')}
            </Button>
          </div>
        </ModalContent>
      </Modal>

      <DisputeDialog dealId={deal.id} open={disputeOpen} onOpenChange={setDisputeOpen} />
      <ChangeRequestDialog dealId={deal.id} open={changeOpen} onOpenChange={setChangeOpen} />
    </Card>
  );
}

/** Открытие спора замораживает сделку — предупреждение стоит прямо в диалоге. */
function DisputeDialog({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('deals.dispute');
  const tRoot = useTranslations();
  const router = useRouter();

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await openDispute(previous, formData);

      if (result.status === 'success') {
        onOpenChange(false);
        router.refresh();
      }

      return result;
    },
    idleState,
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title={t('title')} description={t('description')}>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="dealId" value={dealId} />

          <Alert tone="warning">{t('freezeWarning')}</Alert>

          <div>
            <Label htmlFor="dispute-reason">{t('reason')}</Label>
            <Textarea id="dispute-reason" name="reason" rows={5} required minLength={30} />
          </div>

          {state.status === 'error' && state.message ? (
            <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
          ) : null}

          <Button type="submit" variant="danger" loading={pending}>
            {t('submit')}
          </Button>
        </form>
      </ModalContent>
    </Modal>
  );
}

/** Запрос правки замороженного ТЗ: вторая сторона подтверждает или отклоняет. */
function ChangeRequestDialog({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('deals.briefChange');
  const tRoot = useTranslations();
  const router = useRouter();

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await requestBriefChange(previous, formData);

      if (result.status === 'success') {
        onOpenChange(false);
        router.refresh();
      }

      return result;
    },
    idleState,
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title={t('title')} description={t('description')}>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="dealId" value={dealId} />

          <div>
            <Label htmlFor="change-description">{t('what')}</Label>
            <Textarea id="change-description" name="description" rows={4} required minLength={20} />
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

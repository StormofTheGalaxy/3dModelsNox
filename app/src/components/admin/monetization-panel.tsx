'use client';

import { ArrowUp, Ban, Sparkles, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import {
  endPromotion,
  endSubscription,
  grantPromotion,
  grantSubscription,
} from '@/server/actions/monetization';
import { formatDate } from '@/lib/utils';

/**
 * Монетизация в админке (§1.2.2, post-MVP №12).
 *
 * Ни одной кнопки «купить»: продажа требует платёжного модуля, а он —
 * юрлица. Здесь выдают вручную, и у каждой выдачи есть тот, кто её сделал.
 */

export interface PlanView {
  id: string;
  key: string;
  audience: string;
  priceMinor: number;
  currency: string;
  perks: Record<string, number | boolean>;
}

export interface SubscriptionView {
  id: string;
  nickname: string;
  planKey: string;
  startsAt: string;
  endsAt: string | null;
  note: string | null;
}

export interface PromotionView {
  id: string;
  kind: string;
  target: string;
  targetId: string;
  endsAt: string;
  note: string | null;
}

export function MonetizationPanel({
  locale,
  subscriptionsOn,
  promotionsOn,
  plans,
  subscriptions,
  promotions,
}: {
  locale: string;
  subscriptionsOn: boolean;
  promotionsOn: boolean;
  plans: PlanView[];
  subscriptions: SubscriptionView[];
  promotions: PromotionView[];
}) {
  const t = useTranslations('admin.monetization');
  const tRoot = useTranslations();
  const router = useRouter();

  const [nickname, setNickname] = useState('');
  const [planKey, setPlanKey] = useState(plans[0]?.key ?? 'free');
  const [planDays, setPlanDays] = useState('30');

  const [kind, setKind] = useState('boost');
  const [target, setTarget] = useState('order');
  const [targetRef, setTargetRef] = useState('');
  const [promoDays, setPromoDays] = useState('7');

  const [pending, startTransition] = useTransition();

  function act(action: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      if (done) toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert tone="info">{t('noSelling')}</Alert>

      {/* ── Тарифы ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t('plans')}</h2>
            <Badge variant={subscriptionsOn ? 'success' : 'neutral'}>
              {t(subscriptionsOn ? 'on' : 'off')}
            </Badge>
          </div>

          <ul className="flex flex-col gap-2">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="flex flex-col gap-1 rounded-[var(--radius-card)] bg-surface-2 px-4 py-3"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t(`planKeys.${plan.key}`)}</span>
                  <Badge variant="outline">{t(`audiences.${plan.audience}`)}</Badge>
                  <span className="text-xs text-fg-muted">
                    {plan.priceMinor === 0
                      ? t('freeOfCharge')
                      : t('price', {
                          amount: (plan.priceMinor / 100).toFixed(2),
                          currency: plan.currency,
                        })}
                  </span>
                </span>

                <span className="text-xs break-words text-fg-muted">
                  {Object.keys(plan.perks).length === 0
                    ? t('noPerks')
                    : Object.entries(plan.perks)
                        .map(([key, value]) =>
                          typeof value === 'boolean'
                            ? t(`perks.${key}`)
                            : `${t(`perks.${key}`)}: +${value}`,
                        )
                        .join(' · ')}
                </span>
              </li>
            ))}
          </ul>

          {subscriptionsOn ? (
            <div className="grid gap-3 border-t border-[var(--pf-border)] pt-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-nick">{t('nickname')}</Label>
                <Input
                  id="sub-nick"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-plan">{t('plan')}</Label>
                <Select
                  id="sub-plan"
                  value={planKey}
                  onChange={(event) => setPlanKey(event.target.value)}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.key}>
                      {t(`planKeys.${plan.key}`)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-days">{t('days')}</Label>
                <Input
                  id="sub-days"
                  type="number"
                  min={1}
                  max={730}
                  value={planDays}
                  onChange={(event) => setPlanDays(event.target.value)}
                />
              </div>

              <Button
                loading={pending}
                disabled={!nickname.trim()}
                onClick={() =>
                  act(
                    () => grantSubscription(nickname, planKey, Number(planDays), ''),
                    t('granted'),
                  )
                }
              >
                <Sparkles aria-hidden />
                {t('grant')}
              </Button>
            </div>
          ) : null}

          {subscriptions.length > 0 ? (
            <ul className="flex flex-col gap-2 border-t border-[var(--pf-border)] pt-4">
              {subscriptions.map((subscription) => (
                <li
                  key={subscription.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm">
                    @{subscription.nickname} · {t(`planKeys.${subscription.planKey}`)}
                    {subscription.endsAt
                      ? ` · ${t('until', { date: formatDate(subscription.endsAt, locale) })}`
                      : ''}
                  </span>

                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => act(() => endSubscription(subscription.id), t('ended'))}
                  >
                    <Ban aria-hidden />
                    {t('end')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Буст и featured ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t('promotions')}</h2>
            <Badge variant={promotionsOn ? 'success' : 'neutral'}>
              {t(promotionsOn ? 'on' : 'off')}
            </Badge>
          </div>

          <p className="text-sm text-fg-muted">{t('promotionsHint')}</p>

          {promotionsOn ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_1fr_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promo-kind">{t('kind')}</Label>
                <Select
                  id="promo-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  <option value="boost">{t('kinds.boost')}</option>
                  <option value="featured">{t('kinds.featured')}</option>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promo-target">{t('target')}</Label>
                <Select
                  id="promo-target"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="order">{t('targets.order')}</option>
                  <option value="designer">{t('targets.designer')}</option>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promo-ref">
                  {target === 'order' ? t('orderId') : t('nickname')}
                </Label>
                <Input
                  id="promo-ref"
                  value={targetRef}
                  onChange={(event) => setTargetRef(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promo-days">{t('days')}</Label>
                <Input
                  id="promo-days"
                  type="number"
                  min={1}
                  max={90}
                  value={promoDays}
                  onChange={(event) => setPromoDays(event.target.value)}
                />
              </div>

              <Button
                loading={pending}
                disabled={!targetRef.trim()}
                onClick={() =>
                  act(
                    () => grantPromotion(kind, target, targetRef, Number(promoDays), ''),
                    t('granted'),
                  )
                }
              >
                <ArrowUp aria-hidden />
                {t('grant')}
              </Button>
            </div>
          ) : null}

          {promotions.length > 0 ? (
            <ul className="flex flex-col gap-2 border-t border-[var(--pf-border)] pt-4">
              {promotions.map((promotion) => (
                <li
                  key={promotion.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <Badge variant={promotion.kind === 'featured' ? 'accent' : 'warning'}>
                      {promotion.kind === 'featured' ? (
                        <Star aria-hidden className="size-3" />
                      ) : (
                        <ArrowUp aria-hidden className="size-3" />
                      )}
                      {t(`kinds.${promotion.kind}`)}
                    </Badge>
                    <span className="text-fg-muted">{t(`targets.${promotion.target}`)}</span>
                    <span className="font-mono text-xs break-all">{promotion.targetId}</span>
                    <span className="text-xs text-fg-muted">
                      {t('until', { date: formatDate(promotion.endsAt, locale) })}
                    </span>
                  </span>

                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => act(() => endPromotion(promotion.id), t('ended'))}
                  >
                    <Ban aria-hidden />
                    {t('end')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

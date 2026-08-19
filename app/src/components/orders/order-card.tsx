'use client';

import { ArrowUp, CalendarDays, Gavel, Star, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface OrderCardData {
  id: string;
  title: string;
  assetType: string | null;
  styles: string[];
  engine: string | null;
  budgetMode: string;
  budgetAmount: number | null;
  budgetCurrency: string;
  deadline: string | null;
  previewUrl: string | null;
  competition: 'low' | 'medium' | 'high';
  isInvited: boolean;
  /** Заказ поднят в выдаче (post-MVP №12). */
  isBoosted?: boolean;
  /** Торги вместо откликов (§3). Ставка видна только в открытом режиме. */
  auction: { mode: string; bestAmount: number | null; endsAt: string | null } | null;
  publishedAt: string | null;
  customer: {
    nickname: string;
    displayName: string | null;
    avatarUrl: string | null;
    rating: number;
    ratingCount: number;
  };
}

const COMPETITION_TONE = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
} as const;

/** Карточка заказа на витрине (§4.5). */
export function OrderCard({ order, locale }: { order: OrderCardData; locale: string }) {
  const t = useTranslations('orders');
  const tAuction = useTranslations('orders.auction');
  const tTax = useTranslations('taxonomy');

  const budget =
    order.budgetMode === 'fixed' && order.budgetAmount !== null
      ? `${order.budgetAmount.toLocaleString(locale)} ${order.budgetCurrency}`
      : t('budgetOpen');

  const deadline = order.deadline
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
        new Date(order.deadline),
      )
    : null;

  return (
    <Link href={`/orders/${order.id}`}>
      <Card glow className="h-full">
        <CardContent className="flex h-full gap-4">
          {/* Превью-референс из ТЗ — единственная картинка на карточке. */}
          {order.previewUrl ? (
            <span className="hidden size-24 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-surface-2 sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.previewUrl} alt="" className="size-full object-cover" loading="lazy" />
            </span>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">{order.title}</p>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {order.auction ? (
                  <Badge variant="accent">
                    <Gavel className="size-3" aria-hidden />
                    {tAuction(`mode.${order.auction.mode}`)}
                  </Badge>
                ) : null}
                {order.isInvited ? <Badge variant="accent">{t('invitedBadge')}</Badge> : null}
                {/* Подпись обязательна: поднятый заказ обогнал остальные не
                    потому, что подходит лучше, и читатель вправе это знать. */}
                {order.isBoosted ? (
                  <Badge variant="warning">
                    <ArrowUp aria-hidden className="size-3" />
                    {t('boostedBadge')}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {order.assetType ? (
                <Badge variant="accent">{tTax(`assetType.${order.assetType}`)}</Badge>
              ) : null}
              {order.styles.slice(0, 2).map((style) => (
                <Badge key={style} variant="outline">
                  {tTax(`style.${style}`)}
                </Badge>
              ))}
              {order.engine ? <Badge variant="neutral">{order.engine}</Badge> : null}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-fg-muted">
              <span className={cn('font-mono text-sm font-semibold text-fg')}>{budget}</span>

              {/* Текущая ставка — только у открытых торгов: в закрытых её
                  не знает никто, включая заказчика. */}
              {order.auction?.bestAmount !== null && order.auction ? (
                <span className="inline-flex items-center gap-1 font-mono text-sm text-accent">
                  <Gavel className="size-3.5" aria-hidden />
                  {order.auction.bestAmount.toLocaleString(locale)} {order.budgetCurrency}
                </span>
              ) : null}

              {deadline ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {deadline}
                </span>
              ) : null}

              {/* Точное число откликов видит только заказчик (§3). */}
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {t('competition.label')}:{' '}
                <Badge variant={COMPETITION_TONE[order.competition]}>
                  {t(`competition.${order.competition}`)}
                </Badge>
              </span>

              <span className="inline-flex items-center gap-1">
                @{order.customer.nickname}
                {order.customer.ratingCount > 0 ? (
                  <>
                    <Star className="size-3 fill-current text-[var(--pf-warning)]" aria-hidden />
                    {order.customer.rating.toFixed(1)}
                  </>
                ) : null}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

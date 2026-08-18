import { EyeOff, Gavel, Timer, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { AuctionCountdown } from '@/components/orders/auction-countdown';
import { CloseAuctionButton, SelectWinnerButton } from '@/components/orders/auction-actions';
import { AuctionWinnerActions } from '@/components/orders/auction-winner-actions';
import { BidForm } from '@/components/orders/bid-form';
import type { AuctionState } from '@/server/auctions';
import { cn, formatDate } from '@/lib/utils';

/**
 * Панель торгов на странице заказа (§3, post-MVP №1).
 *
 * Серверный компонент: что зрителю видно, решено в `@/server/auctions`, сюда
 * приходит уже отфильтрованное состояние. Разметка ничего не прячет — прятать
 * на клиенте нечего, потому что скрытого в пропсах и нет.
 */

const COMPETITION_TONE = { low: 'success', medium: 'warning', high: 'danger' } as const;

export async function AuctionPanel({
  auction,
  locale,
  viewerId,
  isCustomer,
  canBid,
  minDecrementPct,
  maxBidsPerDesigner,
}: {
  auction: AuctionState;
  locale: string;
  viewerId: string | null;
  isCustomer: boolean;
  /** Дизайнер вправе торговаться: подтверждён, есть профиль, заказ открыт. */
  canBid: boolean;
  minDecrementPct: number;
  maxBidsPerDesigner: number;
}) {
  const t = await getTranslations('orders.auction');

  const open = !auction.closedAt;
  const isWinner =
    auction.winnerDecision === 'pending' &&
    auction.bids.some((bid) => bid.isWinner && bid.isOwn);

  // Потолок следующей ставки: шаг вниз от своей прошлой.
  const maxUndercut = auction.ownBid
    ? Math.floor(auction.ownBid.amount * (1 - minDecrementPct / 100))
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Gavel className="size-4 text-accent" aria-hidden />
          {t(`mode.${auction.mode}`)}
        </CardTitle>

        <div className="flex flex-wrap items-center gap-2">
          {auction.mode === 'sealed' && !auction.revealed ? (
            <Badge variant="neutral">
              <EyeOff className="size-3" aria-hidden />
              {t('sealedUntilReveal')}
            </Badge>
          ) : null}

          {open ? (
            <Badge variant="success">{t('open')}</Badge>
          ) : (
            <Badge variant="neutral">{t('closed')}</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-fg-muted">{t('startPrice')}</dt>
            <dd className="text-sm">
              {auction.startPrice === null ? (
                t('noStartPrice')
              ) : (
                <span className="font-mono">
                  {auction.startPrice.toLocaleString(locale)} {auction.currency}
                </span>
              )}
            </dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <Timer className="size-3" aria-hidden />
              {t('endsAt')}
            </dt>
            <dd className="text-sm">
              {auction.endsAt ? (
                open ? (
                  <AuctionCountdown
                    endsAt={auction.endsAt.toISOString()}
                    fallback={formatDate(auction.endsAt, locale)}
                    className="text-sm"
                  />
                ) : (
                  formatDate(auction.endsAt, locale)
                )
              ) : (
                t('noDeadline')
              )}
            </dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <Users className="size-3" aria-hidden />
              {t('bidders')}
            </dt>
            <dd className="text-sm">
              {/* Точное число участников видит заказчик; остальным — градация,
                  как и по откликам на обычном заказе (§3). */}
              {auction.bidderCount !== null ? (
                <span className="font-mono">{auction.bidderCount}</span>
              ) : (
                <Badge variant={COMPETITION_TONE[auction.competition]}>
                  {t(`competition.${auction.competition}`)}
                </Badge>
              )}
            </dd>
          </div>
        </dl>

        {auction.bestAmount !== null ? (
          <p className="rounded-[var(--radius-card)] bg-surface-2 px-4 py-3 text-sm">
            {t('bestBid', {
              amount: auction.bestAmount.toLocaleString(locale),
              currency: auction.currency,
            })}
          </p>
        ) : null}

        {auction.mode === 'sealed' && !auction.revealed ? (
          <Alert tone="info">{t('sealedExplainer')}</Alert>
        ) : null}

        {auction.bids.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {auction.bids.map((bid, index) => (
              <li
                key={bid.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border px-4 py-3',
                  bid.isWinner
                    ? 'border-accent bg-accent/10'
                    : bid.isOwn
                      ? 'border-accent/40 bg-surface-2'
                      : 'border-[var(--pf-border)]',
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Место в торгах: в открытом режиме порядок и есть смысл. */}
                    {auction.revealed ? (
                      <span className="font-mono text-xs text-fg-muted">#{index + 1}</span>
                    ) : null}

                    <Link
                      href={`/designers/${bid.nickname}`}
                      className="truncate font-medium hover:text-accent"
                    >
                      @{bid.nickname}
                    </Link>

                    {bid.isOwn ? <Badge variant="outline">{t('yours')}</Badge> : null}
                    {bid.isWinner ? <Badge variant="accent">{t('winner')}</Badge> : null}
                  </div>

                  {bid.comment ? (
                    <p className="truncate text-xs text-fg-muted">{bid.comment}</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-mono font-semibold">
                      {bid.amount.toLocaleString(locale)} {bid.currency}
                    </p>
                    {bid.days !== null ? (
                      <p className="text-xs text-fg-muted">{t('days', { days: bid.days })}</p>
                    ) : null}
                  </div>

                  {/* Выбрать победителя можно только после вскрытия и пока
                      выбор не сделан. */}
                  {isCustomer && auction.revealed && !auction.winnerBidId ? (
                    <SelectWinnerButton bidId={bid.id} nickname={bid.nickname} />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-fg-muted">
            {auction.mode === 'sealed' && !auction.revealed ? t('noOwnBid') : t('noBids')}
          </p>
        )}

        {auction.winnerDecision === 'declined' || auction.winnerDecision === 'expired' ? (
          <Alert tone="warning">{t(`winnerDecision.${auction.winnerDecision}`)}</Alert>
        ) : null}

        {isWinner && viewerId ? (
          <AuctionWinnerActions
            orderId={auction.orderId}
            amount={auction.bids.find((bid) => bid.isWinner)?.amount ?? 0}
            currency={auction.currency}
            deadlineLabel={
              auction.winnerDeadlineAt ? formatDate(auction.winnerDeadlineAt, locale) : null
            }
          />
        ) : null}

        {isCustomer && open ? <CloseAuctionButton orderId={auction.orderId} /> : null}

        {canBid && open && !isCustomer ? (
          <div className="border-t border-[var(--pf-border)] pt-4">
            <BidForm
              orderId={auction.orderId}
              currency={auction.currency}
              startPrice={auction.startPrice}
              ownBid={auction.ownBid}
              maxUndercut={maxUndercut}
              bidsLeft={Math.max(0, maxBidsPerDesigner - auction.ownBidCount)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

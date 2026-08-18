import type { Metadata } from 'next';
import { ExternalLink, Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MetricTile } from '@/components/profile/metric-tile';
import { ReportDialog } from '@/components/report/report-dialog';
import { ReviewList } from '@/components/reviews/review-list';
import { getCurrentUser } from '@/server/auth/session';
import { getPublicCustomer } from '@/server/profiles';
import { listPublishedReviews } from '@/server/reviews';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; nickname: string }>;
}): Promise<Metadata> {
  const { nickname } = await params;
  const customer = await getPublicCustomer(nickname);
  if (!customer) return {};

  return {
    title: customer.profile.displayName,
    description: customer.profile.bio?.slice(0, 180) ?? undefined,
  };
}

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ locale: string; nickname: string }>;
}) {
  const { locale, nickname } = await params;
  setRequestLocale(locale);

  const [customer, viewer] = await Promise.all([getPublicCustomer(nickname), getCurrentUser()]);
  if (!customer) notFound();

  const isOwner = viewer?.id === customer.id;

  const [t, tTax, reviews] = await Promise.all([
    getTranslations('profile'),
    getTranslations('taxonomy'),
    listPublishedReviews(customer.id),
  ]);

  const { profile } = customer;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="pf-gradient flex size-full items-center justify-center text-xl font-bold text-white">
                {profile.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>

          <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold sm:text-3xl">{profile.displayName}</h1>
                <Badge variant="neutral">{tTax(`customerType.${profile.type}`)}</Badge>
              </div>
              <p className="text-sm text-fg-muted">
                @{customer.nickname} · {t('memberSince', { date: formatDate(customer.createdAt, locale) })}
              </p>
            </div>

            {isOwner ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/profile/customer">
                  <Pencil aria-hidden />
                  {t('editCustomer')}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {profile.projectLinks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {profile.projectLinks.map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pf-border)] px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {new URL(link).hostname}
              </a>
            ))}
          </div>
        ) : null}

        {profile.bio ? (
          <Card>
            <CardContent className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
              {profile.bio}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile label={t('metrics.ordersCreated')} value={profile.ordersCreated} />
          <MetricTile label={t('metrics.dealsCompleted')} value={profile.dealsCompleted} />
          <MetricTile
            label={t('metrics.rating')}
            value={profile.ratingCount > 0 ? profile.rating.toFixed(1) : '—'}
          />
          <MetricTile
            label={t('metrics.disputes')}
            value={profile.disputesLost}
            tone={profile.disputesLost > 0 ? 'danger' : 'neutral'}
          />
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">{t('reviews')}</h2>
          <ReviewList
            reviews={reviews.map((review) => ({
              id: review.id,
              overall: review.overall,
              sub1: review.sub1,
              sub2: review.sub2,
              sub3: review.sub3,
              text: review.text,
              reply: review.reply,
              targetRole: review.targetRole,
              publishedAt: review.publishedAt?.toISOString() ?? null,
              author: review.author
                ? { id: review.author.id, nickname: review.author.nickname }
                : null,
            }))}
            locale={locale}
            canReplyAs={isOwner ? customer.id : null}
          />
        </section>

        {!isOwner ? <ReportDialog targetType="user" targetId={customer.id} /> : null}
      </div>
    </div>
  );
}

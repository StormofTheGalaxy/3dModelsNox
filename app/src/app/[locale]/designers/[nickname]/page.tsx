import type { Metadata } from 'next';
import { BadgeCheck, Images, MapPin, Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricTile } from '@/components/profile/metric-tile';
import { ReportDialog } from '@/components/report/report-dialog';
import { AchievementBadges } from '@/components/achievements/achievement-badges';
import { achievementCatalog } from '@/server/achievements';
import { achievementLabels } from '@/server/achievement-labels';
import { ReviewList } from '@/components/reviews/review-list';
import { WorkCard } from '@/components/works/work-card';
import { getCurrentUser } from '@/server/auth/session';
import { getPublicDesigner } from '@/server/profiles';
import { listPublishedReviews } from '@/server/reviews';
import { listDesignerWorks } from '@/server/works';
import { prisma } from '@polyforge/db';
import type { Locale } from '@polyforge/shared';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; nickname: string }>;
}): Promise<Metadata> {
  const { locale, nickname } = await params;
  const designer = await getPublicDesigner(nickname);
  if (!designer) return {};

  const t = await getTranslations({ locale, namespace: 'profile' });
  const description = designer.profile.bio?.slice(0, 180) ?? t('designerTitle');

  return {
    title: designer.nickname,
    description,
    openGraph: {
      title: `${designer.nickname} · PolyForge`,
      description,
      images: [`/${locale}/designers/${designer.nickname}/opengraph-image`],
    },
  };
}

export default async function DesignerProfilePage({
  params,
}: {
  params: Promise<{ locale: string; nickname: string }>;
}) {
  const { locale, nickname } = await params;
  setRequestLocale(locale);

  const [designer, viewer] = await Promise.all([getPublicDesigner(nickname), getCurrentUser()]);
  if (!designer) notFound();

  const isOwner = viewer?.id === designer.id;

  const [t, tTax, works, reviews, featuredAchievements] = await Promise.all([
    getTranslations('profile'),
    getTranslations('taxonomy'),
    // Владелец видит и работы «по ссылке» — это его портфолио.
    listDesignerWorks(designer.id, isOwner),
    listPublishedReviews(designer.id),
    // Избранные достижения у ника (§3): не больше пяти, порядок — по выдаче.
    prisma.userAchievement.findMany({
      where: { userId: designer.id, featured: true },
      orderBy: { grantedAt: 'asc' },
      take: 5,
      select: { key: true, tier: true },
    }),
  ]);

  // Иконку и подпись избранных достижений берём из каталога: у собственных
  // достижений подписи нет в словаре, а у полки и у ника она должна совпадать.
  const catalog = await achievementCatalog();
  const labels = await achievementLabels(catalog, locale as Locale);
  const byKey = new Map(catalog.map((entry) => [entry.key, entry]));

  const featuredBadges = featuredAchievements.flatMap((achievement) => {
    const entry = byKey.get(achievement.key);
    if (!entry) return [];

    return [
      {
        key: achievement.key,
        tier: achievement.tier,
        icon: entry.icon,
        title: labels.get(achievement.key)?.title ?? achievement.key,
      },
    ];
  });

  const { profile } = designer;

  return (
    <div>
      {/* Обложка */}
      <div className="relative h-40 w-full overflow-hidden bg-surface-2 sm:h-56">
        {profile.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="pf-gradient size-full opacity-25" />
        )}
      </div>

      {/* relative обязателен: обложка выше — позиционированный элемент, и без
          этого она рисуется поверх аватара, который заезжает на неё отступом. */}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="-mt-12 flex flex-col gap-6 sm:-mt-14">
          <div className="flex flex-wrap items-end gap-4">
            <span className="size-24 shrink-0 overflow-hidden rounded-2xl border-4 border-[var(--pf-bg)] bg-surface-2 sm:size-28">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="pf-gradient flex size-full items-center justify-center text-2xl font-bold text-white">
                  {designer.nickname.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>

            <div className="flex flex-1 flex-wrap items-center justify-between gap-3 pb-1">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold sm:text-3xl">{designer.nickname}</h1>

                  {profile.verifiedAt ? (
                    <Badge variant="accent">
                      <BadgeCheck className="size-3" aria-hidden />
                      {tTax(`level.${profile.level}`)}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">{tTax(`level.${profile.level}`)}</Badge>
                  )}

                  <Badge variant={profile.availability === 'open' ? 'success' : 'neutral'}>
                    {tTax(`availability.${profile.availability}`)}
                  </Badge>

                  <AchievementBadges achievements={featuredBadges} />
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-fg-muted">
                  {profile.country ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden />
                      {profile.country}
                    </span>
                  ) : null}
                  <span>{t('memberSince', { date: formatDate(designer.createdAt, locale) })}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isOwner ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/profile/designer">
                      <Pencil aria-hidden />
                      {t('editDesigner')}
                    </Link>
                  </Button>
                ) : (
                  <>
                    {/* Приглашения и чат приходят в фазах 3 и 4. */}
                    <Button size="sm" disabled title={t('soonPhase')}>
                      {t('invite')}
                    </Button>
                    <Button variant="outline" size="sm" disabled title={t('soonPhase')}>
                      {t('message')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Специализации, стили, софт */}
          <div className="flex flex-wrap gap-1.5">
            {profile.specializations.map((item) => (
              <Badge key={item} variant="accent">
                {tTax(`specialization.${item}`)}
              </Badge>
            ))}
            {profile.styles.map((item) => (
              <Badge key={item} variant="outline">
                {tTax(`style.${item}`)}
              </Badge>
            ))}
            {profile.software.map((item) => (
              <Badge key={item} variant="neutral">
                {item}
              </Badge>
            ))}
          </div>

          {profile.bio ? (
            <Card>
              <CardContent className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
                {profile.bio}
              </CardContent>
            </Card>
          ) : null}

          {/* Метрики (§4.2) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile label={t('metrics.ordersCompleted')} value={profile.ordersCompleted} />
            <MetricTile
              label={t('metrics.rating')}
              value={profile.ratingCount > 0 ? profile.rating.toFixed(1) : '—'}
            />
            <MetricTile
              label={t('metrics.onTime')}
              value={profile.onTimePct === null ? '—' : `${profile.onTimePct}%`}
            />
            <MetricTile
              label={t('metrics.disputes')}
              value={profile.disputesLost}
              tone={profile.disputesLost > 0 ? 'danger' : 'neutral'}
            />
          </div>

          {/* Портфолио */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{t('portfolio')}</h2>
              {isOwner ? (
                <Button asChild size="sm">
                  <Link href="/works/new">{t('createProfile')}</Link>
                </Button>
              ) : null}
            </div>

            {works.length === 0 ? (
              <EmptyState
                icon={Images}
                title={t('noWorks')}
                description={isOwner ? t('noWorksOwn') : undefined}
              />
            ) : (
              <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid">
                {works.map((work) => (
                  <WorkCard
                    key={work.id}
                    work={{
                      id: work.id,
                      title: work.title,
                      likesCount: work.likesCount,
                    commentsCount: work.commentsCount,
                      views: work.views,
                      badgeOnPlatform: work.badgeOnPlatform,
                      designer: { nickname: designer.nickname },
                      media: work.media,
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 pb-4">
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
              canReplyAs={isOwner ? designer.id : null}
            />
          </section>

          {!isOwner ? (
            <div className="pb-8">
              <ReportDialog targetType="user" targetId={designer.id} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

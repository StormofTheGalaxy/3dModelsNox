import type { Metadata } from 'next';
import { Crown, Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SPECIALIZATIONS, type Specialization } from '@polyforge/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { designerOfTheWeek, leaderboard, type LeaderboardEntry } from '@/server/leaderboards';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'top' });
  return { title: t('title'), description: t('description') };
}

/**
 * Лидерборды (§4.8): месяц и всё время, срез по специализациям,
 * «дизайнер недели» отдельной карточкой.
 */
export default async function TopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string; spec?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const period = query.period === 'all' ? 'all' : 'month';
  const specialization = (SPECIALIZATIONS as readonly string[]).includes(query.spec ?? '')
    ? (query.spec as Specialization)
    : undefined;

  const [entries, featured, t, tTax] = await Promise.all([
    leaderboard({ period, specialization }),
    designerOfTheWeek(),
    getTranslations('top'),
    getTranslations('taxonomy'),
  ]);

  const tab = (value: 'month' | 'all') => ({
    href: `/top?period=${value}${specialization ? `&spec=${specialization}` : ''}`,
    active: period === value,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <p className="mb-6 text-sm text-fg-muted">{t('description')}</p>

      {featured ? (
        <Card className="mb-6 border-accent/40">
          <CardContent className="flex flex-wrap items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Crown aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-accent">{t('designerOfWeek')}</p>
              <Link
                href={`/designers/${featured.nickname}`}
                className="font-bold hover:text-accent"
              >
                {featured.nickname}
              </Link>
              <p className="text-sm text-fg-muted">
                {t('ratingLine', {
                  rating: featured.rating.toFixed(2),
                  count: featured.ratingCount,
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('periodLabel')}>
        {(['month', 'all'] as const).map((value) => {
          const entry = tab(value);
          return (
            <Link
              key={value}
              href={entry.href}
              aria-current={entry.active ? 'page' : undefined}
              className={
                entry.active
                  ? 'rounded-full bg-accent-soft px-3.5 py-1.5 text-sm font-medium text-accent'
                  : 'rounded-full bg-surface-2 px-3.5 py-1.5 text-sm text-fg-muted hover:text-fg'
              }
            >
              {t(`periods.${value}`)}
            </Link>
          );
        })}
      </nav>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label={t('specLabel')}>
        <Link
          href={`/top?period=${period}`}
          aria-current={specialization ? undefined : 'page'}
          className={
            specialization
              ? 'rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted hover:text-fg'
              : 'rounded-full bg-accent-soft px-3 py-1 text-xs text-accent'
          }
        >
          {t('allSpecs')}
        </Link>
        {SPECIALIZATIONS.map((spec) => (
          <Link
            key={spec}
            href={`/top?period=${period}&spec=${spec}`}
            aria-current={specialization === spec ? 'page' : undefined}
            className={
              specialization === spec
                ? 'rounded-full bg-accent-soft px-3 py-1 text-xs text-accent'
                : 'rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted hover:text-fg'
            }
          >
            {tTax(`specialization.${spec}`)}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('empty')}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry, index) => (
            <li key={entry.userId}>
              <Row entry={entry} place={index + 1} locale={locale} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({
  entry,
  place,
  locale,
}: {
  entry: LeaderboardEntry;
  place: number;
  locale: string;
}) {
  return (
    <Card glow>
      <CardContent className="flex items-center gap-4 p-4">
        <span
          className={
            place <= 3
              ? 'w-7 shrink-0 text-center text-lg font-bold text-accent'
              : 'w-7 shrink-0 text-center text-sm text-fg-muted'
          }
        >
          {place}
        </span>

        <div className="min-w-0 flex-1">
          <Link href={`/designers/${entry.nickname}`} className="font-medium hover:text-accent">
            {entry.nickname}
          </Link>
          <p className="flex items-center gap-1 text-sm text-fg-muted">
            <Star aria-hidden className="size-3.5 fill-[var(--pf-warning)] text-[var(--pf-warning)]" />
            {entry.rating.toFixed(2)} · {entry.dealsCompleted.toLocaleString(locale)}
          </p>
        </div>

        <Badge variant={entry.level === 'top' ? 'accent' : 'outline'}>{entry.level}</Badge>
      </CardContent>
    </Card>
  );
}

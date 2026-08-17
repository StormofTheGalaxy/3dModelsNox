import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AVAILABILITY_STATES, ART_STYLES, SPECIALIZATIONS } from '@polyforge/shared';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { DesignerFilters } from '@/components/profile/designer-filters';
import { listDesigners } from '@/server/profiles';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'designers' });
  return { title: t('title'), description: t('subtitle') };
}

function isOneOf<T extends string>(value: string | undefined, options: readonly T[]): T | undefined {
  return value && (options as readonly string[]).includes(value) ? (value as T) : undefined;
}

export default async function DesignersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, tTax] = await Promise.all([
    getTranslations('designers'),
    getTranslations('taxonomy'),
  ]);

  // Значения из URL приходят от пользователя — сверяем со справочником,
  // иначе они уедут в запрос Prisma как есть.
  const { items } = await listDesigners({
    specialization: isOneOf(query.specialization, SPECIALIZATIONS),
    style: isOneOf(query.style, ART_STYLES),
    availability: isOneOf(query.availability, AVAILABILITY_STATES),
    verifiedOnly: query.verified === '1',
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <p className="mt-1.5 mb-7 text-sm text-fg-muted">{t('subtitle')}</p>

      <div className="mb-7">
        <DesignerFilters />
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Users} title={t('title')} description={t('empty')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((designer) => (
            <Link key={designer.id} href={`/designers/${designer.user.nickname}`}>
              <Card glow className="h-full">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                      {designer.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={designer.avatarUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="pf-gradient flex size-full items-center justify-center font-bold text-white">
                          {designer.user.nickname.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{designer.user.nickname}</p>
                      <p className="truncate text-xs text-fg-muted">
                        {designer.country ?? tTax(`availability.${designer.availability}`)}
                      </p>
                    </div>

                    <Badge variant={designer.availability === 'open' ? 'success' : 'neutral'}>
                      {tTax(`level.${designer.level}`)}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {designer.specializations.slice(0, 3).map((item) => (
                      <Badge key={item} variant="accent">
                        {tTax(`specialization.${item}`)}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-sm">
                    <span className="text-fg-muted">
                      {designer.hourlyRate
                        ? t('perHour', {
                            amount: designer.hourlyRate,
                            currency: designer.currency,
                          })
                        : designer.minBudget
                          ? t('from', {
                              amount: designer.minBudget,
                              currency: designer.currency,
                            })
                          : t('noRate')}
                    </span>
                    <span className="font-mono text-xs text-fg-muted">
                      {t('orders', { count: designer.ordersCompleted })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import { FileText, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { parseBriefSections } from '@polyforge/shared';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireVerifiedUser } from '@/server/auth/guards';
import { listOwnBriefs } from '@/server/briefs';
import { getBalances } from '@/server/ai/credits';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brief' });
  return { title: t('mine') };
}

const STATUS_TONE = {
  draft: 'neutral',
  active: 'success',
  frozen: 'warning',
  archived: 'outline',
} as const;

export default async function BriefsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, tAi, tTeams, briefs, balances] = await Promise.all([
    getTranslations('brief'),
    getTranslations('brief.ai'),
    getTranslations('teams'),
    listOwnBriefs(user.id),
    getBalances(user.id),
  ]);

  const briefCredits = balances.find((balance) => balance.pool === 'brief_generate');

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{t('mine')}</h1>
          {briefCredits ? (
            <span className="text-sm text-fg-muted">
              {tAi('credits')} · {tAi('creditsLeft', { left: briefCredits.left })}
            </span>
          ) : null}
        </div>

        <Button asChild>
          <Link href="/briefs/new">
            <Plus aria-hidden />
            {t('new')}
          </Link>
        </Button>
      </div>

      {briefs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('empty')}
          description={t('emptyHint')}
          action={
            <Button asChild>
              <Link href="/briefs/new">{t('new')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {briefs.map((brief) => {
            const sections = parseBriefSections(brief.sections);
            return (
              <Link key={brief.id} href={`/briefs/${brief.id}`}>
                <Card glow>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="truncate font-semibold">{brief.title || t('untitled')}</p>
                      <p className="truncate text-xs text-fg-muted">
                        {t('version', { version: brief.currentVersion })} ·{' '}
                        {formatDate(brief.updatedAt, locale)}
                        {sections.general.assetType ? ` · ${sections.general.assetType}` : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {/* Общее ТЗ помечено: в одном списке со своими его иначе
                          не отличить, а правит его вся команда (§1.4). */}
                      {brief.organization ? (
                        <Badge variant="accent">
                          {tTeams('teamBadge', { name: brief.organization.name })}
                        </Badge>
                      ) : null}
                      <Badge variant={STATUS_TONE[brief.status]}>{t(`status.${brief.status}`)}</Badge>
                      <Badge variant="outline">{t(`access.${brief.access}`)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

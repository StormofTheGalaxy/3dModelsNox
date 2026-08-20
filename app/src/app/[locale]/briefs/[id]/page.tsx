import type { Metadata } from 'next';
import { History, Pencil, Send } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BriefAccessControl } from '@/components/briefs/access-control';
import { BriefContent } from '@/components/briefs/brief-content';
import { BriefPdfExport } from '@/components/briefs/pdf-export';
import { BriefOwnerActions } from '@/components/briefs/owner-actions';
import { requireVerifiedUser } from '@/server/auth/guards';
import { getOwnBrief, listBriefVersions } from '@/server/briefs';
import { publicEnv } from '@/server/env';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brief' });
  // Приватная страница: в индекс её пускать не нужно.
  return { title: t('title'), robots: { index: false, follow: false } };
}

const STATUS_TONE = {
  draft: 'neutral',
  active: 'success',
  frozen: 'warning',
  archived: 'outline',
} as const;

export default async function BriefPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const brief = await getOwnBrief(id, user.id);
  if (!brief) notFound();

  const [t, tOrders, versions] = await Promise.all([
    getTranslations('brief'),
    getTranslations('orders'),
    listBriefVersions(brief.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{brief.title || t('untitled')}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_TONE[brief.status]}>{t(`status.${brief.status}`)}</Badge>
            <Badge variant="outline">{t('version', { version: brief.currentVersion })}</Badge>
            <span className="text-xs text-fg-muted">{formatDate(brief.updatedAt, locale)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BriefPdfExport
            briefId={brief.id}
            initialStatus={brief.pdfStatus}
            initialUrl={brief.pdfUrl}
          />

          {brief.status !== 'frozen' ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/briefs/${brief.id}/edit`}>
                <Pencil aria-hidden />
                {t('edit')}
              </Link>
            </Button>
          ) : null}

          {/* Главное действие с готовым ТЗ — опубликовать по нему заказ.
              Его тут не было, и заказчик должен был догадаться пойти в
              «Заказы» и выбрать своё ТЗ из списка. */}
          {brief.status !== 'frozen' && brief.status !== 'archived' ? (
            <Button asChild size="sm">
              <Link href={`/orders/new?brief=${brief.id}`}>
                <Send aria-hidden />
                {tOrders('publish')}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-4">
          <BriefContent sections={brief.sections} />
        </div>

        <aside className="flex flex-col gap-4">
          <BriefAccessControl
            briefId={brief.id}
            initialAccess={brief.access}
            initialToken={brief.shareToken}
            baseUrl={publicEnv.NEXT_PUBLIC_APP_URL}
            locale={locale}
          />

          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4 text-fg-muted" aria-hidden />
                {t('versions')}
              </h2>

              {versions.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('versionsEmpty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {versions.slice(0, 10).map((version) => (
                    <li key={version.id} className="flex flex-col gap-0.5 text-sm">
                      <span className="font-medium">
                        {t('version', { version: version.version })}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {formatDate(version.createdAt, locale)}
                        {version.author ? ` · ${version.author.nickname}` : ''}
                        {version.comment ? ` · ${version.comment}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <BriefOwnerActions briefId={brief.id} canModify={brief.status !== 'frozen'} />
        </aside>
      </div>
    </div>
  );
}

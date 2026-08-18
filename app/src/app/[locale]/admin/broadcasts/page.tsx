import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BroadcastForm } from '@/components/admin/broadcast-form';
import { getCurrentUser } from '@/server/auth/session';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

const STATUS_TONE = {
  draft: 'neutral',
  sending: 'warning',
  sent: 'success',
  failed: 'danger',
} as const;

/** Ручные рассылки (§4.10). */
export default async function AdminBroadcastsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (user?.role !== 'admin') notFound();

  const [broadcasts, t] = await Promise.all([
    prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        segment: true,
        locale: true,
        subject: true,
        status: true,
        total: true,
        sent: true,
        createdAt: true,
        author: { select: { nickname: true } },
      },
    }),
    getTranslations('admin'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.broadcasts')}</h1>

      <BroadcastForm />

      {broadcasts.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('broadcasts.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {broadcasts.map((broadcast) => (
            <li key={broadcast.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{broadcast.subject}</p>
                    <p className="text-sm text-fg-muted">
                      {t(`broadcasts.segments.${broadcast.segment}`)}
                      {broadcast.locale ? ` · ${broadcast.locale.toUpperCase()}` : ''} ·{' '}
                      {broadcast.author?.nickname ?? '—'} ·{' '}
                      {formatDate(broadcast.createdAt, locale)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">
                      {broadcast.sent} / {broadcast.total}
                    </span>
                    <Badge variant={STATUS_TONE[broadcast.status]}>
                      {t(`broadcasts.status.${broadcast.status}`)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

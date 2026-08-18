import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { WaitlistTable } from '@/components/admin/waitlist-table';
import { getCurrentUser } from '@/server/auth/session';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

/** Лист ожидания и инвайты (§4.10, §4.11). */
export default async function AdminInvitesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (user?.role !== 'admin') notFound();

  const [waiting, invited, invites, t] = await Promise.all([
    prisma.waitlistEntry.findMany({
      where: { invitedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, email: true, locale: true, source: true, createdAt: true },
    }),
    prisma.waitlistEntry.count({ where: { invitedAt: { not: null } } }),
    prisma.invite.groupBy({ by: ['usedById'], _count: { _all: true } }),
    getTranslations('admin'),
  ]);

  const used = invites.find((row) => row.usedById !== null)?._count._all ?? 0;
  const unused = invites.find((row) => row.usedById === null)?._count._all ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.invites')}</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: t('invites.waiting'), value: waiting.length },
          { label: t('invites.invited'), value: invited },
          { label: t('invites.unusedCodes'), value: unused },
        ].map((tile) => (
          <Card key={tile.label}>
            <CardContent className="p-4">
              <p className="text-sm text-fg-muted">{tile.label}</p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {tile.value.toLocaleString(locale)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm text-fg-muted">{t('invites.usedCodes', { count: used })}</p>

      {waiting.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('invites.empty')}</p>
      ) : (
        <WaitlistTable
          entries={waiting.map((entry) => ({
            id: entry.id,
            email: entry.email,
            locale: entry.locale,
            source: entry.source,
            createdAt: formatDate(entry.createdAt, locale),
          }))}
        />
      )}

      <Badge variant="outline" className="w-fit">
        {t('invites.note')}
      </Badge>
    </div>
  );
}

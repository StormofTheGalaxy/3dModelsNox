import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { getCurrentUser, isStaff } from '@/server/auth/session';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'disputes' });
  return { title: t('title'), robots: { index: false } };
}

/** Очередь споров для арбитра (§4.6). */
export default async function DisputesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  // Для постороннего раздела не существует — 404, а не 403.
  if (!isStaff(user)) notFound();

  const [disputes, t] = await Promise.all([
    prisma.dispute.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true,
        status: true,
        verdict: true,
        createdAt: true,
        deal: { select: { title: true, price: true, currency: true } },
      },
    }),
    getTranslations('disputes'),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">{t('title')}</h1>

      {disputes.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {disputes.map((dispute) => (
            <li key={dispute.id}>
              <Card glow>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/admin/disputes/${dispute.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {dispute.deal.title}
                    </Link>
                    <span className="text-sm text-fg-muted">
                      {dispute.deal.price.toLocaleString(locale)} {dispute.deal.currency} ·{' '}
                      {formatDate(dispute.createdAt, locale)}
                    </span>
                  </div>

                  <Badge variant={dispute.status === 'open' ? 'danger' : 'success'}>
                    {t(`status.${dispute.status}`)}
                  </Badge>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

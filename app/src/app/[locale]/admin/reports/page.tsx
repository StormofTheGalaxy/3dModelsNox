import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ReportActions } from '@/components/report/report-actions';
import { getCurrentUser, isStaff } from '@/server/auth/session';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

/** Очередь жалоб (§4.10): подтверждение выдаёт страйк, отказ закрывает. */
export default async function AdminReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!isStaff(user)) notFound();

  const [reports, t, tTax] = await Promise.all([
    prisma.report.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        category: true,
        text: true,
        createdAt: true,
        reporter: { select: { nickname: true } },
      },
    }),
    getTranslations('report'),
    getTranslations('taxonomy'),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">{t('queue')}</h1>

      {reports.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('queueEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="danger">
                      {tTax(`reportCategory.${report.category}`)}
                    </Badge>
                    <Badge variant="outline">{report.targetType}</Badge>
                    <span className="text-xs text-fg-muted">
                      {report.reporter?.nickname} · {formatDate(report.createdAt, locale)}
                    </span>
                  </div>

                  {report.text ? (
                    <p className="text-sm whitespace-pre-line">{report.text}</p>
                  ) : null}

                  <p className="font-mono text-xs break-all text-fg-muted">{report.targetId}</p>

                  <ReportActions reportId={report.id} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

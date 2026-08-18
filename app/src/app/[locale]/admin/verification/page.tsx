import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { VerificationDecision } from '@/components/verification/verification-decision';
import { Link } from '@/i18n/navigation';
import { getCurrentUser, isStaff } from '@/server/auth/session';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

/** Очередь верификаций (§4.9, §4.10). */
export default async function AdminVerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!isStaff(user)) notFound();

  const [requests, t] = await Promise.all([
    prisma.verificationRequest.findMany({
      where: { status: 'submitted' },
      orderBy: { submittedAt: 'asc' },
      take: 50,
      select: {
        id: true,
        processNote: true,
        submittedAt: true,
        images: { select: { id: true, url: true } },
        task: { select: { titleRu: true, titleEn: true, specialization: true } },
        user: {
          select: {
            nickname: true,
            designerProfile: { select: { specializations: true, level: true } },
          },
        },
      },
    }),
    getTranslations('verification'),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">{t('queue')}</h1>

      {requests.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('queueEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => (
            <li key={request.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/designers/${request.user.nickname}`}
                      className="font-bold hover:text-accent"
                    >
                      {request.user.nickname}
                    </Link>
                    <Badge variant="outline">
                      {request.submittedAt ? formatDate(request.submittedAt, locale) : ''}
                    </Badge>
                  </div>

                  <p className="text-sm font-medium">
                    {locale === 'en' ? request.task.titleEn : request.task.titleRu}
                  </p>

                  {request.images.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {request.images.map((image) => (
                        <li key={image.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt=""
                            className="size-24 rounded-[var(--radius-control)] object-cover"
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div>
                    <p className="mb-1 text-xs font-medium text-fg-muted">{t('process')}</p>
                    <p className="text-sm whitespace-pre-line">{request.processNote}</p>
                  </div>

                  <VerificationDecision requestId={request.id} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

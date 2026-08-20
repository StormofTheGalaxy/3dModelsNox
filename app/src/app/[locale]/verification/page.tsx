import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { VerificationFlow } from '@/components/verification/verification-flow';
import { Link } from '@/i18n/navigation';
import { redirectToLogin } from '@/server/auth/redirects';
import { getCurrentUser } from '@/server/auth/session';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'verification' });
  return { title: t('title'), robots: { index: false } };
}

/** Верификация дизайнера (§4.9): выбор задания, сдача, ожидание решения. */
export default async function VerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirectToLogin(locale, `/${locale}/verification`);

  const profile = await prisma.designerProfile.findUnique({
    where: { userId: user.id },
    select: { specializations: true, verifiedAt: true, level: true },
  });

  const [t, tProfile] = await Promise.all([
    getTranslations('verification'),
    getTranslations('profile'),
  ]);

  if (!profile) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Alert tone="warning">{t('needProfile')}</Alert>
        {/* Надпись «заполните профиль» без пути к профилю — тупик: человек
            уже здесь, значит он и хотел этим заняться. */}
        <Button asChild className="sm:w-fit">
          <Link href="/profile/designer">{tProfile('createProfile')}</Link>
        </Button>
      </div>
    );
  }

  const [request, tasks] = await Promise.all([
    prisma.verificationRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        processNote: true,
        decisionNote: true,
        retryAfter: true,
        submittedAt: true,
        decidedAt: true,
        images: { select: { id: true, url: true } },
        task: { select: { id: true, titleRu: true, titleEn: true, bodyRu: true, bodyEn: true } },
      },
    }),
    prisma.testTask.findMany({
      where: {
        isActive: true,
        // Пул фильтруется по специализациям дизайнера: задание из чужой
        // области ничего не проверяет (§4.9).
        ...(profile.specializations.length > 0
          ? { specialization: { in: profile.specializations } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        specialization: true,
        titleRu: true,
        titleEn: true,
        bodyRu: true,
        bodyEn: true,
        estimateHours: true,
      },
    }),
  ]);

  if (profile.verifiedAt) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-5">
            <Badge variant="success">{t('verified')}</Badge>
            <span className="text-sm text-fg-muted">
              {formatDate(profile.verifiedAt, locale)}
            </span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <p className="mb-6 text-sm text-fg-muted">{t('description')}</p>

      <VerificationFlow
        locale={locale}
        tasks={tasks}
        request={
          request
            ? {
                ...request,
                retryAfter: request.retryAfter?.toISOString() ?? null,
                submittedAt: request.submittedAt?.toISOString() ?? null,
                decidedAt: request.decidedAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </div>
  );
}

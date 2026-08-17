import type { Metadata } from 'next';
import { Images, Plus, UserCog } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { prisma } from '@polyforge/db';

import { Link } from '@/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { WorkCard } from '@/components/works/work-card';
import { requireVerifiedUser } from '@/server/auth/guards';
import { getProfileState } from '@/server/profiles';
import { listDesignerWorks } from '@/server/works';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('title') };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const profileState = await getProfileState(user.id);

  // Новый пользователь ещё не выбирал роль — отправляем в мастер онбординга.
  if (!profileState.hasDesigner && !profileState.hasCustomer) {
    redirect(`/${locale}/onboarding`);
  }

  const [t, tRole, tWorks, tProfile] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('roleContext'),
    getTranslations('works'),
    getTranslations('profile'),
  ]);

  // Контекст показываем тот, что выбран в шапке, но только если такой профиль есть.
  const context =
    user.lastRoleContext === 'customer' && profileState.hasCustomer ? 'customer' : 'designer';

  const isDesigner = context === 'designer' && profileState.hasDesigner;

  const [works, ordersCount] = await Promise.all([
    isDesigner ? listDesignerWorks(user.id, true) : Promise.resolve([]),
    isDesigner
      ? Promise.resolve(0)
      : prisma.customerProfile
          .findUnique({ where: { userId: user.id }, select: { ordersCreated: true } })
          .then((profile) => profile?.ordersCreated ?? 0),
  ]);

  const profileComplete = isDesigner
    ? profileState.designerComplete
    : profileState.customerComplete;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {t('greeting', { nickname: user.nickname })}
        </h1>
        <Badge variant="accent">{tRole(context)}</Badge>
      </div>

      {!profileComplete ? (
        <Card className="mb-6 border-accent/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-semibold">{t('completeProfile')}</p>
              <p className="text-sm text-fg-muted">
                {isDesigner ? t('completeProfileDesigner') : t('completeProfileCustomer')}
              </p>
            </div>
            <Button asChild>
              <Link href={isDesigner ? '/profile/designer' : '/profile/customer'}>
                <UserCog aria-hidden />
                {tProfile('createProfile')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isDesigner ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-bold">{t('myWorks')}</h2>
              <span className="text-sm text-fg-muted">
                {t('worksCount', { count: works.length })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {profileComplete ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/designers/${user.nickname}`}>{t('openProfile')}</Link>
                </Button>
              ) : null}
              <Button asChild size="sm">
                <Link href="/works/new">
                  <Plus aria-hidden />
                  {t('addWork')}
                </Link>
              </Button>
            </div>
          </div>

          {works.length === 0 ? (
            <EmptyState
              icon={Images}
              title={tWorks('empty.title')}
              description={tProfile('noWorksOwn')}
              action={
                <Button asChild>
                  <Link href="/works/new">{t('addWork')}</Link>
                </Button>
              }
            />
          ) : (
            <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid">
              {works.map((work) => (
                <WorkCard
                  key={work.id}
                  work={{
                    id: work.id,
                    title: work.title,
                    likesCount: work.likesCount,
                    views: work.views,
                    badgeOnPlatform: work.badgeOnPlatform,
                    designer: { nickname: user.nickname },
                    media: work.media,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">{tProfile('metrics.ordersCreated')}</h2>
          <p className="font-mono text-3xl font-bold">{ordersCount}</p>
          {/* Заказы, отклики и сделки приходят в фазах 3 и 4. */}
          <Alert tone="info">{t('ordersSoon')}</Alert>
        </section>
      )}
    </div>
  );
}

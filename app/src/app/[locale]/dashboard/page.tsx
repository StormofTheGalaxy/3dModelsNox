import type { Metadata } from 'next';
import { Compass } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { requireVerifiedUser } from '@/server/auth/guards';

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
  const [t, tRole] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('roleContext'),
  ]);

  const isDesigner = user.lastRoleContext === 'designer';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('greeting', { nickname: user.nickname })}</h1>
        <Badge variant="accent">{tRole(user.lastRoleContext)}</Badge>
      </div>

      {/* Наполнение кабинета приходит в фазах 1–4; каркас и гварды — здесь. */}
      <EmptyState
        icon={Compass}
        title={t('title')}
        description={isDesigner ? t('designerSoon') : t('customerSoon')}
      />
    </div>
  );
}

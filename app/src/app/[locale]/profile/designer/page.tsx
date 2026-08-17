import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { DesignerProfileForm } from '@/components/profile/designer-profile-form';
import { requireVerifiedUser } from '@/server/auth/guards';
import { getDesignerProfile } from '@/server/profiles';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });
  return { title: t('editDesigner') };
}

export default async function EditDesignerProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, profile] = await Promise.all([
    getTranslations('profile'),
    getDesignerProfile(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('editDesigner')}</h1>
        {profile?.completedAt ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/designers/${user.nickname}`}>{t('designerTitle')}</Link>
          </Button>
        ) : null}
      </div>

      <DesignerProfileForm
        values={{
          avatarUrl: profile?.avatarUrl ?? null,
          coverUrl: profile?.coverUrl ?? null,
          country: profile?.country ?? null,
          languages: profile?.languages ?? [],
          specializations: profile?.specializations ?? [],
          styles: profile?.styles ?? [],
          software: profile?.software ?? [],
          engines: profile?.engines ?? [],
          hourlyRate: profile?.hourlyRate ?? null,
          minBudget: profile?.minBudget ?? null,
          currency: profile?.currency ?? 'USD',
          availability: profile?.availability ?? 'open',
          bio: profile?.bio ?? null,
        }}
      />
    </div>
  );
}

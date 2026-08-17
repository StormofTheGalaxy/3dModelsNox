import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { CustomerProfileForm } from '@/components/profile/customer-profile-form';
import { requireVerifiedUser } from '@/server/auth/guards';
import { getCustomerProfile } from '@/server/profiles';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });
  return { title: t('editCustomer') };
}

export default async function EditCustomerProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, profile] = await Promise.all([
    getTranslations('profile'),
    getCustomerProfile(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('editCustomer')}</h1>
        {profile?.completedAt ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/customers/${user.nickname}`}>{t('customerTitle')}</Link>
          </Button>
        ) : null}
      </div>

      <CustomerProfileForm
        values={{
          avatarUrl: profile?.avatarUrl ?? null,
          displayName: profile?.displayName ?? user.nickname,
          type: profile?.type ?? 'indie',
          projectLinks: profile?.projectLinks ?? [],
          bio: profile?.bio ?? null,
        }}
      />
    </div>
  );
}

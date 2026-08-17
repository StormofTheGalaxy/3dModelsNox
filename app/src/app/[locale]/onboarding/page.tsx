import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OnboardingChoice } from '@/components/profile/onboarding-choice';
import { requireVerifiedUser } from '@/server/auth/guards';
import { getProfileState } from '@/server/profiles';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'onboarding' });
  return { title: t('title') };
}

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const state = await getProfileState(user.id);

  // Онбординг — одноразовый шаг: у кого профиль уже есть, тому здесь нечего делать.
  if (state.hasDesigner || state.hasCustomer) {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations('onboarding');

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 py-16 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingChoice />
        </CardContent>
      </Card>
    </div>
  );
}

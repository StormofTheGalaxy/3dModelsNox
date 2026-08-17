import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/components/forms/password-forms';
import { publicEnv } from '@/server/env';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('forgotTitle') };
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('forgotTitle')}</CardTitle>
        <CardDescription>{t('forgotSubtitle')}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <ForgotPasswordForm siteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />

        <Link href="/login" className="text-center text-sm text-fg-muted hover:text-fg">
          {t('submitLogin')}
        </Link>
      </CardContent>
    </Card>
  );
}

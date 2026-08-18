import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { redirectIfAuthenticated } from '@/server/auth/guards';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DiscordButton } from '@/components/forms/discord-button';
import { LoginForm } from '@/components/forms/login-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('loginTitle') };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Увод уже вошедшего в кабинет делает страница, а не proxy: только здесь
  // видно, жива ли сессия на самом деле.
  await redirectIfAuthenticated(locale);

  const t = await getTranslations('auth');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('loginTitle')}</CardTitle>
        <CardDescription>{t('loginSubtitle')}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <LoginForm />

        <DiscordButton locale={locale} />

        <p className="text-center text-sm text-fg-muted">
          {t('noAccount')}{' '}
          <Link href="/register" className="font-medium text-accent hover:underline">
            {t('submitRegister')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

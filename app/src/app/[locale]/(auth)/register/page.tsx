import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { COOKIES } from '@polyforge/shared';

import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DiscordButton } from '@/components/forms/discord-button';
import { RegisterForm } from '@/components/forms/register-form';
import { publicEnv } from '@/server/env';
import { getSetting } from '@/server/settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('registerTitle') };
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, inviteOnly, cookieStore] = await Promise.all([
    getTranslations('auth'),
    getSetting('registration_invite_only'),
    cookies(),
  ]);

  // Код мог прийти из ссылки /i/<code> — она кладёт его в куку.
  const presetInviteCode = query.invite ?? cookieStore.get(COOKIES.inviteCode)?.value ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('registerTitle')}</CardTitle>
        <CardDescription>{inviteOnly ? t('registerSubtitle') : null}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <RegisterForm
          siteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          inviteOnly={inviteOnly}
          presetInviteCode={presetInviteCode.toUpperCase()}
        />

        <DiscordButton locale={locale} />

        <p className="text-center text-sm text-fg-muted">
          {t('haveAccount')}{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t('submitLogin')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

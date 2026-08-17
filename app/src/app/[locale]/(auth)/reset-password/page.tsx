import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from '@/components/forms/password-forms';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('resetTitle') };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, tErrors] = await Promise.all([
    getTranslations('auth'),
    getTranslations('errors'),
  ]);

  const token = query.token ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('resetTitle')}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <>
            <Alert tone="danger">{tErrors('token.invalid')}</Alert>
            <Link href="/forgot-password" className="text-center text-sm text-accent hover:underline">
              {t('forgotSubmit')}
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

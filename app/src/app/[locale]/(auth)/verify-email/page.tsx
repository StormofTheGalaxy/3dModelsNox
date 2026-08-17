import type { Metadata } from 'next';
import { MailCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResendVerification } from '@/components/forms/resend-verification';
import { verifyEmailToken } from '@/server/actions/auth';
import { getCurrentUser } from '@/server/auth/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('verifyTitle') };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, user] = await Promise.all([getTranslations('auth'), getCurrentUser()]);

  // Переход по ссылке из письма: подтверждаем сразу при рендере страницы.
  const verified = query.token ? await verifyEmailToken(query.token) : null;

  const email = query.email ?? user?.email ?? '';

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <MailCheck className="size-5" aria-hidden />
        </div>
        <CardTitle className="text-2xl">{t('verifyTitle')}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {verified === true ? (
          <>
            <Alert tone="success">{t('verifySuccess')}</Alert>
            <Button asChild size="lg" block>
              <Link href="/dashboard">{t('submitLogin')}</Link>
            </Button>
          </>
        ) : verified === false ? (
          <>
            <Alert tone="danger">{t('verifyFailed')}</Alert>
            {user ? <ResendVerification /> : null}
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-fg-muted">
              {t('verifySentTo', { email })}
            </p>
            {user && !user.emailVerifiedAt ? <ResendVerification /> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

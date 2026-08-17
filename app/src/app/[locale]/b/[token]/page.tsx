import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BriefContent } from '@/components/briefs/brief-content';
import { getCurrentUser } from '@/server/auth/session';
import { getBriefByShareToken } from '@/server/briefs';

/**
 * Публичная страница ТЗ по секретной ссылке (§4.4).
 *
 * Гость видит ТЗ целиком — в этом смысл шаринга; аккаунт нужен только для
 * отклика. Это и есть воронка регистрации, о которой говорит ТЗ.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}): Promise<Metadata> {
  const { locale, token } = await params;
  const brief = await getBriefByShareToken(token);
  if (!brief) return {};

  const t = await getTranslations({ locale, namespace: 'brief' });
  const description = brief.sections.general.description.slice(0, 180) || t('public.badge');

  return {
    title: brief.title || t('untitled'),
    description,
    openGraph: {
      type: 'article',
      title: brief.title || t('untitled'),
      description,
      images: [`/${locale}/b/${token}/opengraph-image`],
    },
    // Секретная ссылка не должна попасть в поиск.
    robots: { index: false, follow: false },
  };
}

export default async function SharedBriefPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const brief = await getBriefByShareToken(token);
  if (!brief) notFound();

  const [t, viewer] = await Promise.all([getTranslations('brief'), getCurrentUser()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-col gap-3">
        <Badge variant="accent" className="w-fit">
          <FileText className="size-3" aria-hidden />
          {t('public.badge')}
        </Badge>

        <h1 className="text-2xl font-bold sm:text-3xl">{brief.title || t('untitled')}</h1>
        <p className="text-sm text-fg-muted">
          {t('public.byAuthor', { nickname: brief.owner.nickname })} ·{' '}
          {t('version', { version: brief.currentVersion })}
        </p>
      </div>

      <BriefContent sections={brief.sections} />

      <Card className="mt-6 border-accent/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{t('public.respondCta')}</p>
            <p className="text-sm text-fg-muted">{t('public.respondHint')}</p>
          </div>

          {viewer ? (
            <Button disabled>{t('public.respondCta')}</Button>
          ) : (
            <Button asChild>
              <Link href="/register">{t('public.registerCta')}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

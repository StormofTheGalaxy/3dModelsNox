import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { EmptyState } from '@/components/ui/empty-state';
import { ReloadButton } from '@/components/pwa/reload-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pwa.offline' });
  return { title: t('title') };
}

/**
 * Страница «нет сети» (§4.7, post-MVP №8).
 *
 * Её кэширует service worker при установке и показывает вместо ошибки
 * браузера. Поэтому здесь не должно быть ничего, что требует запроса: ни
 * данных пользователя, ни счётчиков.
 */
export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('pwa.offline');

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <EmptyState
        icon={WifiOff}
        title={t('title')}
        description={t('description')}
        action={<ReloadButton label={t('retry')} />}
      />
    </div>
  );
}

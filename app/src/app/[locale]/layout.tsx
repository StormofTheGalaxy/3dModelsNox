import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { COOKIES, LOCALES, type Theme } from '@polyforge/shared';

import '../globals.css';

import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { ThemeScript } from '@/components/theme/theme-script';
import { Analytics } from '@/components/analytics/analytics';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker';
import { Toaster } from '@/components/ui/toast';
import { routing } from '@/i18n/routing';
import { publicEnv } from '@/server/env';
import { pushEnabled } from '@/server/push';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

// Моноширинный — для техполей: полигонаж, хэши транзакций (§5.2).
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
    title: {
      default: t('defaultTitle'),
      template: '%s · PolyForge',
    },
    description: t('defaultDescription'),
    openGraph: {
      type: 'website',
      siteName: 'PolyForge',
      title: t('defaultTitle'),
      description: t('defaultDescription'),
      locale,
    },
    twitter: { card: 'summary_large_image' },
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(LOCALES.map((code) => [code, `/${code}`])),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Без этого статически отрендеренные страницы теряют язык.
  setRequestLocale(locale);

  const [cookieStore, pwaOn] = await Promise.all([cookies(), pushEnabled()]);
  const themePreference = (cookieStore.get(COOKIES.theme)?.value ?? 'dark') as Theme;
  // Для «системной» темы сервер не знает ответа — ставим тёмную по умолчанию,
  // а ThemeScript поправит класс до первой отрисовки.
  const htmlThemeClass = themePreference === 'light' ? 'light' : 'dark';

  return (
    <html
      lang={locale}
      className={`${htmlThemeClass} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          <Header locale={locale} theme={themePreference} />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster />
        </NextIntlClientProvider>

        <Analytics />
        <ServiceWorkerRegistrar enabled={pwaOn} />
      </body>
    </html>
  );
}

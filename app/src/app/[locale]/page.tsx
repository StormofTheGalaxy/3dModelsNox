import { ArrowRight, Boxes, HandCoins, Layers, ShieldCheck, Sparkles, Ticket } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WaitlistForm } from '@/components/forms/waitlist-form';
import { publicEnv } from '@/server/env';
import { getSetting } from '@/server/settings';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, waitlistEnabled] = await Promise.all([
    getTranslations('landing'),
    getSetting('waitlist_enabled'),
  ]);

  const steps = [
    { icon: Sparkles, title: t('step1Title'), text: t('step1Text') },
    { icon: Layers, title: t('step2Title'), text: t('step2Text') },
    { icon: ShieldCheck, title: t('step3Title'), text: t('step3Text') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="pf-aurora relative overflow-hidden">
        <div className="relative mx-auto max-w-4xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28">
          <Badge variant="accent" className="mb-6">
            <Ticket className="size-3" aria-hidden />
            {t('badge')}
          </Badge>

          <h1 className="text-4xl leading-[1.1] font-bold text-balance sm:text-6xl">
            {t('heroTitle')}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
            {t('heroSubtitle')}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="#waitlist">
                {t('ctaPrimary')}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/register">{t('ctaSecondary')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Ценность для двух сторон */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-2">
        <Card glow>
          <CardContent className="flex flex-col gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Boxes className="size-5" aria-hidden />
            </div>
            <h2 className="text-xl font-bold">{t('forDesigners')}</h2>
            <p className="text-sm leading-relaxed text-fg-muted">{t('forDesignersText')}</p>
          </CardContent>
        </Card>

        <Card glow>
          <CardContent className="flex flex-col gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <HandCoins className="size-5" aria-hidden />
            </div>
            <h2 className="text-xl font-bold">{t('forCustomers')}</h2>
            <p className="text-sm leading-relaxed text-fg-muted">{t('forCustomersText')}</p>
          </CardContent>
        </Card>
      </section>

      {/* Как это работает */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">{t('howTitle')}</h2>

        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-accent">0{index + 1}</span>
                    <step.icon className="size-4 text-fg-muted" aria-hidden />
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-fg-muted">{step.text}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Ключевой принцип платформы */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <Card className="border-accent/30 bg-accent-soft">
          <CardContent className="flex flex-col gap-3 py-10 text-center">
            <h2 className="text-2xl font-bold">{t('noFeeTitle')}</h2>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-fg-muted">
              {t('noFeeText')}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Лист ожидания */}
      {waitlistEnabled ? (
        <section id="waitlist" className="mx-auto max-w-xl px-4 pt-20 sm:px-6">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 text-center">
                <h2 className="text-xl font-bold">{t('waitlistTitle')}</h2>
                <p className="text-sm text-fg-muted">{t('waitlistText')}</p>
              </div>
              <WaitlistForm siteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
            </CardContent>
          </Card>
        </section>
      ) : null}
    </>
  );
}

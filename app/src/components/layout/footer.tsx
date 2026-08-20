import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

export async function Footer() {
  const [t, tNav] = await Promise.all([getTranslations('footer'), getTranslations('nav')]);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-[var(--pf-border)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 font-bold">
            <span className="size-5 rounded-md pf-gradient" aria-hidden />
            PolyForge
          </div>
          {/* Обязательная оговорка о характере платформы — §2.4 ТЗ. */}
          <p className="max-w-sm text-xs leading-relaxed text-fg-muted">{t('disclaimer')}</p>
        </div>

        <nav className="flex flex-col gap-2 text-sm" aria-label={t('product')}>
          <p className="mb-1 font-semibold">{t('product')}</p>
          <Link className="text-fg-muted transition-colors hover:text-fg" href="/works">
            {tNav('works')}
          </Link>
          <Link className="text-fg-muted transition-colors hover:text-fg" href="/designers">
            {tNav('designers')}
          </Link>
          <Link className="text-fg-muted transition-colors hover:text-fg" href="/top">
            {tNav('top')}
          </Link>
          <Link className="text-fg-muted transition-colors hover:text-fg" href="/orders">
            {tNav('orders')}
          </Link>
        </nav>

        <nav className="flex flex-col gap-2 text-sm" aria-label={t('legal')}>
          <p className="mb-1 font-semibold">{t('legal')}</p>
          <Link className="text-fg-muted transition-colors hover:text-fg" href="/legal/terms">
            {t('terms')}
          </Link>
          <Link className="text-fg-muted transition-colors hover:text-fg" href="/legal/privacy">
            {t('privacy')}
          </Link>
          <Link className="text-fg-muted transition-colors hover:text-fg" href="/legal/rules">
            {t('rules')}
          </Link>
        </nav>
      </div>

      <div className="border-t border-[var(--pf-border)] px-4 py-5 text-center text-xs text-fg-muted sm:px-6">
        © {year} PolyForge. {t('rights')}.
      </div>
    </footer>
  );
}

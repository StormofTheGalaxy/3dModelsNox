import { Hammer } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { EmptyState } from '@/components/ui/empty-state';

/**
 * Заглушка публичного раздела, который появится в следующих фазах.
 * Нужна, чтобы навигация в шапке была целой уже на каркасе, а не вела в 404.
 */
export async function ComingSoon({ section }: { section: 'works' | 'designers' | 'orders' | 'top' }) {
  const [t, tNav] = await Promise.all([getTranslations('soon'), getTranslations('nav')]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold sm:text-3xl">{tNav(section)}</h1>
      <EmptyState icon={Hammer} title={t('title')} description={t(section)} />
    </div>
  );
}

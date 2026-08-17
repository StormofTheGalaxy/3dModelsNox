import { Compass } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default async function NotFound() {
  const [t, tNav] = await Promise.all([getTranslations('errors'), getTranslations('nav')]);

  return (
    <div className="mx-auto flex max-w-xl flex-col justify-center px-4 py-24 sm:px-6">
      <EmptyState
        icon={Compass}
        title={t('notFound')}
        description={t('notFoundText')}
        action={
          <Button asChild>
            <Link href="/">{tNav('home')}</Link>
          </Button>
        }
      />
    </div>
  );
}

import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PublishOrderForm } from '@/components/orders/publish-order-form';
import { requireVerifiedUser } from '@/server/auth/guards';
import { listOwnBriefs } from '@/server/briefs';
import { getSetting } from '@/server/settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'orders' });
  return { title: t('publish') };
}

export default async function NewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brief?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, tBrief, briefs] = await Promise.all([
    getTranslations('orders'),
    getTranslations('brief'),
    listOwnBriefs(user.id),
  ]);

  // Публиковать можно только по готовому ТЗ: черновики и архив не годятся.
  const available = briefs.filter((brief) => brief.status === 'active' || brief.status === 'draft');

  if (available.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={FileText}
          title={t('publishForm.noBriefs')}
          description={tBrief('emptyHint')}
          action={
            <Button asChild>
              <Link href="/briefs/new">{tBrief('new')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold sm:text-3xl">{t('publish')}</h1>

      <PublishOrderForm
        briefs={available.map((brief) => ({
          id: brief.id,
          title: brief.title || tBrief('untitled'),
        }))}
        preselectedBriefId={query.brief ?? null}
        auctionEnabled={await getSetting('feature_auction')}
      />
    </div>
  );
}

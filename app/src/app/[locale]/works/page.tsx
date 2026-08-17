import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { galleryQuerySchema } from '@polyforge/shared';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { GalleryFilters } from '@/components/works/gallery-filters';
import { WorkGrid } from '@/components/works/work-grid';
import { getCurrentUser } from '@/server/auth/session';
import { getProfileState } from '@/server/profiles';
import { listGalleryWorks } from '@/server/works';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [t, tMeta] = await Promise.all([
    getTranslations({ locale, namespace: 'works' }),
    getTranslations({ locale, namespace: 'meta' }),
  ]);
  return { title: t('title'), description: tMeta('defaultDescription') };
}

export default async function WorksGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  // Параметры приходят из URL: пропускаем через ту же схему, что и догрузка.
  const parsed = galleryQuerySchema.safeParse({
    style: query.style || undefined,
    assetType: query.assetType || undefined,
    software: query.software || undefined,
    sort: query.sort || 'new',
    limit: 24,
  });

  const filters = parsed.success ? parsed.data : galleryQuerySchema.parse({});

  const [t, works, user] = await Promise.all([
    getTranslations('works'),
    listGalleryWorks(filters),
    getCurrentUser(),
  ]);

  const profileState = user ? await getProfileState(user.id) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>

        {profileState?.hasDesigner ? (
          <Button asChild size="sm">
            <Link href="/works/new">
              <Plus aria-hidden />
              {t('new')}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mb-7">
        <GalleryFilters />
      </div>

      <WorkGrid
        // Ключ от фильтров: при их смене список начинается с нового первого экрана.
        key={`${filters.style ?? ''}|${filters.assetType ?? ''}|${filters.software ?? ''}|${filters.sort}`}
        initialItems={works.items.map((work) => ({
          id: work.id,
          title: work.title,
          likesCount: work.likesCount,
          views: work.views,
          badgeOnPlatform: work.badgeOnPlatform,
          designer: { nickname: work.designer.nickname },
          media: work.media,
        }))}
        initialCursor={works.nextCursor}
        filters={{
          style: filters.style,
          assetType: filters.assetType,
          software: filters.software,
          sort: filters.sort,
        }}
        isFiltered={Boolean(filters.style || filters.assetType || filters.software)}
      />
    </div>
  );
}

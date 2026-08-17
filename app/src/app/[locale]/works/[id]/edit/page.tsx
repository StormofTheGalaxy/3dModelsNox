import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { WorkForm } from '@/components/works/work-form';
import { requireVerifiedUser } from '@/server/auth/guards';
import { getSetting } from '@/server/settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'works' });
  return { title: t('edit') };
}

export default async function EditWorkPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);

  const work = await prisma.portfolioWork.findUnique({
    where: { id },
    select: {
      id: true,
      designerId: true,
      title: true,
      description: true,
      assetType: true,
      styles: true,
      software: true,
      engines: true,
      polycount: true,
      textureInfo: true,
      formats: true,
      timeSpentHours: true,
      visibility: true,
      media: {
        orderBy: { order: 'asc' },
        select: { id: true, url: true, type: true, status: true },
      },
    },
  });

  // Чужую работу не показываем даже на чтение: правка — приватный экран.
  if (!work || work.designerId !== user.id) notFound();

  const [t, maxImages] = await Promise.all([
    getTranslations('works'),
    getSetting('work_images_max'),
  ]);

  const isDraft = work.title === '';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold sm:text-3xl">{isDraft ? t('new') : t('edit')}</h1>

      <WorkForm
        isEdit={!isDraft}
        maxImages={maxImages}
        values={{
          id: work.id,
          title: work.title,
          description: work.description ?? '',
          assetType: work.assetType,
          styles: work.styles,
          software: work.software,
          engines: work.engines,
          polycount: work.polycount,
          textureInfo: work.textureInfo ?? '',
          formats: work.formats,
          timeSpentHours: work.timeSpentHours,
          visibility: work.visibility,
          media: work.media,
        }}
      />
    </div>
  );
}

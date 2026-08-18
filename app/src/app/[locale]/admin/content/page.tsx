import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LOCALES } from '@polyforge/shared';

import { Card, CardContent } from '@/components/ui/card';
import { FeaturedDesignerForm } from '@/components/admin/featured-designer-form';
import { LegalEditor } from '@/components/admin/legal-editor';
import { getCurrentUser } from '@/server/auth/session';
import { listLegalDocuments } from '@/server/legal';
import { designerOfTheWeek } from '@/server/leaderboards';
import { LEGAL_DOCS } from '@/content/legal';

export const metadata: Metadata = { robots: { index: false } };

/** Контент платформы (§4.10): дизайнер недели и правовые документы. */
export default async function AdminContentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (user?.role !== 'admin') notFound();

  const [documents, featured, t] = await Promise.all([
    listLegalDocuments(),
    designerOfTheWeek(),
    getTranslations('admin'),
  ]);

  const stored = new Map(documents.map((doc) => [`${doc.slug}:${doc.locale}`, doc]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.content')}</h1>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <h2 className="font-bold">{t('content.featured')}</h2>
          <FeaturedDesignerForm current={featured?.nickname ?? ''} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t('content.legal')}</h2>
        <p className="text-sm text-fg-muted">{t('content.legalHint')}</p>

        {LEGAL_DOCS.flatMap((slug) =>
          LOCALES.map((docLocale) => {
            const doc = stored.get(`${slug}:${docLocale}`);

            return (
              <LegalEditor
                key={`${slug}:${docLocale}`}
                slug={slug}
                locale={docLocale}
                title={doc?.title ?? ''}
                body={doc?.body ?? ''}
                updatedBy={doc?.updatedBy?.nickname ?? null}
              />
            );
          }),
        )}
      </section>
    </div>
  );
}

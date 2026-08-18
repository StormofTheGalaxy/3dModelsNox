import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LOCALES, isLocale } from '@polyforge/shared';

import { Alert } from '@/components/ui/alert';
import { LEGAL_DOCS, isLegalDoc } from '@/content/legal';
import { LegalMarkdown } from '@/components/legal/markdown';
import { getLegalDocument } from '@/server/legal';
import { formatDate } from '@/lib/utils';

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => LEGAL_DOCS.map((doc) => ({ locale, doc })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isLegalDoc(doc)) return {};

  const t = await getTranslations({ locale, namespace: 'legal' });
  return { title: t(doc) };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}) {
  const { locale, doc } = await params;
  setRequestLocale(locale);

  if (!isLegalDoc(doc) || !isLocale(locale)) {
    notFound();
  }

  const [t, document] = await Promise.all([
    getTranslations('legal'),
    getLegalDocument(doc, locale),
  ]);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold">{document.title ?? t(doc)}</h1>

      {document.effectiveAt ? (
        <p className="mb-6 text-sm text-fg-muted">
          {t('effectiveAt', { date: formatDate(document.effectiveAt, locale) })}
        </p>
      ) : null}

      {/* Драфт из кода помечается: утверждённый текст заводится в админке. */}
      {document.markdown ? null : (
        <Alert tone="warning" className="mb-8">
          {t('draftNotice')}
        </Alert>
      )}

      {document.markdown ? (
        <LegalMarkdown source={document.markdown} />
      ) : (
        <div className="flex flex-col gap-8">
          {document.sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed text-fg-muted">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

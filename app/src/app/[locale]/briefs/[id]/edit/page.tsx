import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { AIGenerateForm } from '@/components/briefs/ai-generate-form';
import { BriefEditor } from '@/components/briefs/brief-editor';
import { getBalances } from '@/server/ai/credits';
import { aiIsLive } from '@/server/ai/provider';
import { requireVerifiedUser } from '@/server/auth/guards';
import { getOwnBrief } from '@/server/briefs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brief' });
  return { title: t('edit') };
}

export default async function EditBriefPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const brief = await getOwnBrief(id, user.id);
  if (!brief) notFound();

  const [t, balances] = await Promise.all([getTranslations('brief'), getBalances(user.id)]);
  const briefCredits = balances.find((balance) => balance.pool === 'brief_generate');

  // Пустое ТЗ — повод предложить собрать его из описания, а не вручную.
  const isEmpty = brief.title === '' && brief.sections.general.description === '';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {brief.title || t('new')}
        </h1>

        {brief.status !== 'draft' ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/briefs/${brief.id}`}>{t('open')}</Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        {isEmpty ? (
          <AIGenerateForm
            briefId={brief.id}
            isLive={aiIsLive()}
            creditsLeft={briefCredits?.left ?? 0}
          />
        ) : null}

        <BriefEditor
          briefId={brief.id}
          initialTitle={brief.title}
          initialSections={brief.sections}
          isFrozen={brief.status === 'frozen'}
          aiIsLive={aiIsLive()}
        />
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { FilePlus2, Sparkles } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TemplatePicker } from '@/components/briefs/template-picker';
import { Link } from '@/i18n/navigation';
import { requireVerifiedUser } from '@/server/auth/guards';
import { listBriefTemplates } from '@/server/briefs';
import { publicTemplatesEnabled } from '@/server/templates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brief' });
  return { title: t('new') };
}

export default async function NewBriefPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, tTemplates, tCatalog, templates, catalogOn] = await Promise.all([
    getTranslations('brief'),
    getTranslations('briefTemplates'),
    getTranslations('briefTemplates.catalog'),
    listBriefTemplates(user.id),
    publicTemplatesEnabled(),
  ]);

  // Системные пресеты хранят в БД ключи словаря, личные — готовый текст.
  const items = templates.map((template) => ({
    id: template.id,
    title: template.isSystem && template.key ? tTemplates(`${template.key}.title`) : template.title,
    description:
      template.isSystem && template.key
        ? tTemplates(`${template.key}.description`)
        : (template.description ?? ''),
    isSystem: template.isSystem,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t('new')}</h1>
      <p className="mb-8 text-sm text-fg-muted">{t('chooseTemplateHint')}</p>

      <div className="flex flex-col gap-6">
        <Card className="border-accent/30 bg-accent-soft">
          <CardContent className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-accent" aria-hidden />
              {t('ai.generateTitle')}
            </h2>
            <p className="text-sm text-fg-muted">{t('ai.generateHint')}</p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <FilePlus2 className="size-4 text-fg-muted" aria-hidden />
              {t('chooseTemplate')}
            </h2>

            {/* Каталог сообщества — post-MVP за флагом (§4.4). */}
            {catalogOn ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/templates">{tCatalog('title')}</Link>
              </Button>
            ) : null}
          </div>

          <TemplatePicker templates={items} blankLabel={t('newFromScratch')} blankHint={t('newFromScratchHint')} />
        </div>
      </div>
    </div>
  );
}

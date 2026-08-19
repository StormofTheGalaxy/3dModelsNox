import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ASSET_TYPES } from '@polyforge/shared';

import { TemplateCatalog } from '@/components/briefs/template-catalog';
import { requireVerifiedUser } from '@/server/auth/guards';
import { listOwnTemplates, listPublicTemplates, publicTemplatesEnabled } from '@/server/templates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'briefTemplates' });
  return { title: t('catalog.title') };
}

/**
 * Каталог шаблонов ТЗ (§4.4, post-MVP №6).
 *
 * Страница для вошедших: шаблон нужен, чтобы создать ТЗ, а создать его
 * может только подтверждённый аккаунт. Гостю здесь показывать нечего,
 * кроме списка, по которому он не может ничего сделать.
 */
export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);

  if (!(await publicTemplatesEnabled())) notFound();

  const [t, tTemplates, items, own] = await Promise.all([
    getTranslations('briefTemplates.catalog'),
    getTranslations('briefTemplates'),
    listPublicTemplates(user.id),
    listOwnTemplates(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <p className="mb-8 text-sm text-fg-muted">{t('subtitle')}</p>

      <TemplateCatalog
        canModerate={['moderator', 'arbiter', 'admin'].includes(user.role)}
        canPublish
        assetTypes={[...ASSET_TYPES]}
        items={items.map((item) => ({
          id: item.id,
          isSystem: item.isSystem,
          // Системные пресеты хранят в БД ключи словаря, личные — готовый текст.
          title: item.isSystem && item.key ? tTemplates(`${item.key}.title`) : item.title,
          description:
            item.isSystem && item.key ? tTemplates(`${item.key}.description`) : item.description,
          authorNickname: item.authorNickname,
          usesCount: item.usesCount,
          assetType: item.assetType,
          isOwn: item.isOwn,
        }))}
        own={own.map((template) => ({
          id: template.id,
          title: template.title,
          isPublic: template.isPublic,
          hidden: template.hiddenAt !== null,
          usesCount: template.usesCount,
        }))}
      />
    </div>
  );
}

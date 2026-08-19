import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';
import { parseBriefSections, type AssetType } from '@polyforge/shared';

import { getSetting } from './settings';

/**
 * Публичные шаблоны ТЗ (§4.4, post-MVP №6).
 *
 * Системные пресеты публичны по определению — им флага не нужно. Личный
 * шаблон становится публичным по решению автора и снимается модератором,
 * а не удаляется: у автора он остаётся личным.
 */

export const TEMPLATE_SORTS = ['popular', 'new'] as const;
export type TemplateSort = (typeof TEMPLATE_SORTS)[number];

export interface PublicTemplate {
  id: string;
  /** Ключ i18n у системного пресета; у пользовательского — null. */
  key: string | null;
  isSystem: boolean;
  title: string;
  description: string | null;
  /** Автор пользовательского шаблона. У системного пусто. */
  authorNickname: string | null;
  usesCount: number;
  publishedAt: Date | null;
  /** Тип ассета из секций — по нему фильтруется каталог. */
  assetType: AssetType | null;
  isOwn: boolean;
}

export async function publicTemplatesEnabled(): Promise<boolean> {
  return getSetting('feature_public_templates');
}

const CATALOG_SELECT = {
  id: true,
  key: true,
  isSystem: true,
  ownerId: true,
  title: true,
  description: true,
  sections: true,
  usesCount: true,
  publishedAt: true,
  order: true,
  createdAt: true,
  owner: { select: { nickname: true } },
} satisfies Prisma.BriefTemplateSelect;

function toPublic(
  row: Prisma.BriefTemplateGetPayload<{ select: typeof CATALOG_SELECT }>,
  viewerId: string | null,
): PublicTemplate {
  return {
    id: row.id,
    key: row.key,
    isSystem: row.isSystem,
    title: row.title,
    description: row.description,
    authorNickname: row.isSystem ? null : (row.owner?.nickname ?? null),
    usesCount: row.usesCount,
    publishedAt: row.publishedAt,
    assetType: parseBriefSections(row.sections).general.assetType,
    isOwn: viewerId !== null && row.ownerId === viewerId,
  };
}

/**
 * Каталог: системные пресеты плюс опубликованные пользовательские.
 *
 * Системные всегда впереди — это проверенные заготовки платформы, и
 * задвигать их за чей-то популярный шаблон значит менять смысл списка.
 */
export async function listPublicTemplates(
  viewerId: string | null,
  filter: { assetType?: AssetType; sort?: TemplateSort } = {},
): Promise<PublicTemplate[]> {
  const sort = filter.sort ?? 'popular';

  const [system, community] = await Promise.all([
    prisma.briefTemplate.findMany({
      where: { isSystem: true },
      orderBy: { order: 'asc' },
      select: CATALOG_SELECT,
    }),
    prisma.briefTemplate.findMany({
      where: {
        isSystem: false,
        isPublic: true,
        hiddenAt: null,
        owner: { status: 'active' },
      },
      orderBy:
        sort === 'new'
          ? [{ publishedAt: 'desc' }]
          : [{ usesCount: 'desc' }, { publishedAt: 'desc' }],
      take: 60,
      select: CATALOG_SELECT,
    }),
  ]);

  const all = [...system, ...community].map((row) => toPublic(row, viewerId));

  // Фильтр по типу ассета считается из секций: денормализовать его в
  // колонку ради одного экрана не стоит, шаблонов десятки, а не тысячи.
  return filter.assetType ? all.filter((item) => item.assetType === filter.assetType) : all;
}

/** Личные шаблоны автора со статусом публикации — для управления ими. */
export async function listOwnTemplates(userId: string) {
  return prisma.briefTemplate.findMany({
    where: { ownerId: userId, isSystem: false },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      isPublic: true,
      hiddenAt: true,
      usesCount: true,
      createdAt: true,
    },
  });
}

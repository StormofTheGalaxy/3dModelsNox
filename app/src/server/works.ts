import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';
import type { GalleryQuery } from '@polyforge/shared';

import { redis } from './redis';

/**
 * Чтение и счётчики портфолио (§4.3).
 */

const WORK_CARD_SELECT = {
  id: true,
  title: true,
  assetType: true,
  styles: true,
  likesCount: true,
  views: true,
  badgeOnPlatform: true,
  publishedAt: true,
  designer: { select: { nickname: true } },
  media: {
    where: { type: 'image' as const },
    orderBy: { order: 'asc' as const },
    take: 1,
    select: { url: true, thumbnailUrl: true, width: true, height: true },
  },
} satisfies Prisma.PortfolioWorkSelect;

/** Работы, видимые в публичной выдаче. Скрытые модератором не показываем. */
const PUBLIC_WORK_FILTER = {
  visibility: 'public',
  isHidden: false,
  designer: { status: 'active' },
} satisfies Prisma.PortfolioWorkWhereInput;

function galleryOrder(sort: GalleryQuery['sort']): Prisma.PortfolioWorkOrderByWithRelationInput[] {
  if (sort === 'popular_all') {
    return [{ likesCount: 'desc' }, { publishedAt: 'desc' }];
  }
  if (sort === 'popular_week') {
    // «Популярное за неделю» отличается фильтром по дате, а не порядком.
    return [{ likesCount: 'desc' }, { publishedAt: 'desc' }];
  }
  return [{ publishedAt: 'desc' }];
}

export async function listGalleryWorks(query: GalleryQuery) {
  const limit = query.limit;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const works = await prisma.portfolioWork.findMany({
    where: {
      ...PUBLIC_WORK_FILTER,
      ...(query.style ? { styles: { has: query.style as never } } : {}),
      ...(query.assetType ? { assetType: query.assetType as never } : {}),
      ...(query.software ? { software: { has: query.software } } : {}),
      ...(query.sort === 'popular_week' ? { publishedAt: { gte: weekAgo } } : {}),
    },
    orderBy: galleryOrder(query.sort),
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: WORK_CARD_SELECT,
  });

  const hasMore = works.length > limit;
  const items = hasMore ? works.slice(0, limit) : works;

  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

/** Работы конкретного дизайнера. Владельцу показываем и скрытые по ссылке. */
export async function listDesignerWorks(designerId: string, includePrivate: boolean) {
  return prisma.portfolioWork.findMany({
    where: {
      designerId,
      isHidden: false,
      ...(includePrivate ? {} : { visibility: 'public' }),
    },
    orderBy: { publishedAt: 'desc' },
    select: { ...WORK_CARD_SELECT, visibility: true },
  });
}

export async function getWorkForViewer(workId: string, viewerId: string | null) {
  const work = await prisma.portfolioWork.findUnique({
    where: { id: workId },
    select: {
      id: true,
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
      shareToken: true,
      isHidden: true,
      badgeOnPlatform: true,
      views: true,
      likesCount: true,
      publishedAt: true,
      designerId: true,
      designer: {
        select: {
          nickname: true,
          status: true,
          designerProfile: {
            select: { avatarUrl: true, level: true, specializations: true, availability: true },
          },
        },
      },
      media: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          type: true,
          status: true,
          url: true,
          thumbnailUrl: true,
          width: true,
          height: true,
        },
      },
    },
  });

  if (!work) return null;

  const isOwner = viewerId !== null && viewerId === work.designerId;

  // Скрытую модератором работу видит только автор — чтобы понимать, что произошло.
  if (work.isHidden && !isOwner) return null;
  if (work.designer.status === 'banned' || work.designer.status === 'deleted') {
    if (!isOwner) return null;
  }

  return { ...work, isOwner };
}

/** Лайкнул ли зритель эту работу. */
export async function isLikedByViewer(workId: string, viewerId: string | null): Promise<boolean> {
  if (!viewerId) return false;

  const like = await prisma.workLike.findUnique({
    where: { workId_userId: { workId, userId: viewerId } },
    select: { id: true },
  });

  return Boolean(like);
}

/**
 * Просмотр засчитывается раз в сутки на зрителя.
 *
 * Ключ дедупликации в Redis, а не таблица просмотров: точность здесь не нужна,
 * а миллионы строк — нужны ещё меньше. Если Redis недоступен, просмотр
 * не считается вовсе — лучше недосчитать, чем накрутить.
 */
export async function registerWorkView(workId: string, viewerKey: string): Promise<void> {
  try {
    const key = `view:work:${workId}:${viewerKey}`;
    const isFirst = await redis.set(key, '1', 'EX', 86_400, 'NX');
    if (!isFirst) return;

    await prisma.portfolioWork.update({
      where: { id: workId },
      data: { views: { increment: 1 } },
    });
  } catch {
    // счётчик просмотров не критичен
  }
}

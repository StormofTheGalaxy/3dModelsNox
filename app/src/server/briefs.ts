import 'server-only';

import { randomBytes } from 'node:crypto';

import { prisma, type Prisma } from '@polyforge/db';
import { parseBriefSections, type BriefSections } from '@polyforge/shared';

/**
 * Чтение ТЗ и правила доступа (§4.4).
 *
 * Уровни доступа: private (только владелец), link (по секретной ссылке),
 * selected (перечисленные пользователи), public (всем, попадает в поиск).
 */

const BRIEF_FULL_SELECT = {
  id: true,
  ownerId: true,
  ownerRole: true,
  title: true,
  status: true,
  access: true,
  shareToken: true,
  allowedUserIds: true,
  sourceLocale: true,
  sections: true,
  currentVersion: true,
  pdfStatus: true,
  pdfUrl: true,
  pdfVersion: true,
  views: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, nickname: true } },
} satisfies Prisma.BriefSelect;

export interface BriefWithSections {
  id: string;
  ownerId: string;
  ownerRole: 'customer' | 'designer';
  title: string;
  status: 'draft' | 'active' | 'frozen' | 'archived';
  access: 'private' | 'link' | 'selected' | 'public';
  shareToken: string | null;
  allowedUserIds: string[];
  sourceLocale: 'ru' | 'en';
  sections: BriefSections;
  currentVersion: number;
  pdfStatus: 'pending' | 'ready' | 'failed' | null;
  pdfUrl: string | null;
  pdfVersion: number | null;
  views: number;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; nickname: string };
}

function toBrief(row: Prisma.BriefGetPayload<{ select: typeof BRIEF_FULL_SELECT }>): BriefWithSections {
  return { ...row, sections: parseBriefSections(row.sections) } as BriefWithSections;
}

/** ТЗ владельца — полный доступ, включая черновики. */
export async function getOwnBrief(briefId: string, ownerId: string): Promise<BriefWithSections | null> {
  const brief = await prisma.brief.findUnique({ where: { id: briefId }, select: BRIEF_FULL_SELECT });
  if (!brief || brief.ownerId !== ownerId) return null;
  return toBrief(brief);
}

export type BriefViewerAccess = 'owner' | 'allowed' | 'public' | 'link' | 'denied';

/**
 * Проверка прав на просмотр. Токен из ссылки передаётся отдельно: он даёт
 * доступ, даже если зритель не авторизован — в этом и смысл шаринга (§4.4).
 */
export async function getBriefForViewer(
  briefId: string,
  viewerId: string | null,
  shareToken?: string | null,
): Promise<{ brief: BriefWithSections; access: BriefViewerAccess } | null> {
  const row = await prisma.brief.findUnique({ where: { id: briefId }, select: BRIEF_FULL_SELECT });
  if (!row) return null;

  const brief = toBrief(row);

  if (viewerId && brief.ownerId === viewerId) {
    return { brief, access: 'owner' };
  }

  // Архив и черновик видит только владелец: остальным их показывать нечестно.
  if (brief.status === 'draft' || brief.status === 'archived') {
    return null;
  }

  if (brief.access === 'public') {
    return { brief, access: 'public' };
  }

  if (brief.access === 'link' && shareToken && brief.shareToken === shareToken) {
    return { brief, access: 'link' };
  }

  if (brief.access === 'selected' && viewerId && brief.allowedUserIds.includes(viewerId)) {
    return { brief, access: 'allowed' };
  }

  return null;
}

/** Публичная страница по секретной ссылке `/b/<token>`. */
export async function getBriefByShareToken(token: string): Promise<BriefWithSections | null> {
  const row = await prisma.brief.findUnique({
    where: { shareToken: token },
    select: BRIEF_FULL_SELECT,
  });

  if (!row) return null;
  const brief = toBrief(row);

  // Ссылка перестаёт работать, если ТЗ вернули в черновик или заархивировали.
  if (brief.status === 'draft' || brief.status === 'archived') return null;
  if (brief.access !== 'link' && brief.access !== 'public') return null;

  return brief;
}

export async function listOwnBriefs(ownerId: string) {
  return prisma.brief.findMany({
    where: { ownerId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      access: true,
      currentVersion: true,
      updatedAt: true,
      sections: true,
    },
  });
}

export async function listBriefVersions(briefId: string) {
  return prisma.briefVersion.findMany({
    where: { briefId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      title: true,
      comment: true,
      createdAt: true,
      author: { select: { nickname: true } },
    },
  });
}

/** Шаблоны: системные пресеты плюс личные шаблоны пользователя. */
export async function listBriefTemplates(userId: string | null) {
  return prisma.briefTemplate.findMany({
    where: userId ? { OR: [{ isSystem: true }, { ownerId: userId }] } : { isSystem: true },
    orderBy: [{ isSystem: 'desc' }, { order: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      key: true,
      isSystem: true,
      title: true,
      description: true,
      sections: true,
    },
  });
}

export function generateShareToken(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Снимок версии. Пишется при каждом осмысленном сохранении, а не на каждый
 * автосейв: иначе история превратится в поток из сотен одинаковых записей.
 */
export async function createBriefVersion(
  briefId: string,
  version: number,
  title: string,
  sections: BriefSections,
  authorId: string,
  comment: string,
): Promise<void> {
  await prisma.briefVersion.create({
    data: {
      briefId,
      version,
      title,
      sections: sections as unknown as Prisma.InputJsonValue,
      authorId,
      comment: comment || null,
    },
  });
}

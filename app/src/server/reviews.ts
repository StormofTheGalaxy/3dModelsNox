import 'server-only';

import { prisma } from '@polyforge/db';

/**
 * Чтение отзывов (§4.8).
 *
 * Двойное слепое означает, что до публикации чужой отзыв не виден никому,
 * включая адресата: иначе вторая сторона подстраивает свой текст под чужой,
 * и вся конструкция теряет смысл.
 */

const PUBLIC_SELECT = {
  id: true,
  overall: true,
  sub1: true,
  sub2: true,
  sub3: true,
  text: true,
  reply: true,
  repliedAt: true,
  targetRole: true,
  publishedAt: true,
  createdAt: true,
  dealId: true,
  author: {
    select: {
      id: true,
      nickname: true,
      designerProfile: { select: { avatarUrl: true } },
      customerProfile: { select: { displayName: true, avatarUrl: true } },
    },
  },
} as const;

export async function listPublishedReviews(userId: string, limit = 20) {
  return prisma.review.findMany({
    where: { targetId: userId, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: PUBLIC_SELECT,
  });
}

/** Отзыв, написанный этим пользователем по этой сделке (свой всегда виден). */
export async function getOwnReview(dealId: string, authorId: string) {
  return prisma.review.findUnique({
    where: { dealId_authorId: { dealId, authorId } },
    select: {
      id: true,
      overall: true,
      sub1: true,
      sub2: true,
      sub3: true,
      text: true,
      status: true,
      editableUntil: true,
      publishedAt: true,
    },
  });
}

/** Отзыв о пользователе по сделке — показывается только после публикации. */
export async function getReviewAbout(dealId: string, targetId: string) {
  return prisma.review.findFirst({
    where: { dealId, targetId, status: 'published' },
    select: PUBLIC_SELECT,
  });
}

/**
 * Публикация пары отзывов по сделке.
 *
 * Вызывается и при написании второго отзыва, и по таймеру из воркера:
 * условие одно — либо обе стороны высказались, либо вышел срок ожидания.
 */
export async function publishDealReviews(dealId: string): Promise<number> {
  const pending = await prisma.review.findMany({
    where: { dealId, status: 'hidden_pending' },
    select: { id: true, targetId: true },
  });

  if (pending.length === 0) return 0;

  await prisma.review.updateMany({
    where: { id: { in: pending.map((review) => review.id) } },
    data: { status: 'published', publishedAt: new Date() },
  });

  return pending.length;
}

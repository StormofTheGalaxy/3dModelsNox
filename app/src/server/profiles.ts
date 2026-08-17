import 'server-only';

import { prisma } from '@polyforge/db';

/**
 * Чтение профилей (§4.2). Профиль создаётся при первом использовании роли,
 * поэтому у пользователя может не быть ни одного, одного или обоих.
 */

const DESIGNER_PUBLIC_SELECT = {
  avatarUrl: true,
  coverUrl: true,
  country: true,
  languages: true,
  specializations: true,
  styles: true,
  software: true,
  engines: true,
  hourlyRate: true,
  minBudget: true,
  currency: true,
  availability: true,
  bio: true,
  level: true,
  verifiedAt: true,
  ordersCompleted: true,
  rating: true,
  ratingCount: true,
  onTimePct: true,
  repeatClientsPct: true,
  disputesLost: true,
  completedAt: true,
} as const;

export async function getDesignerProfile(userId: string) {
  return prisma.designerProfile.findUnique({ where: { userId } });
}

export async function getCustomerProfile(userId: string) {
  return prisma.customerProfile.findUnique({ where: { userId } });
}

/** Какие профили у пользователя уже заведены — от этого зависит меню и дашборд. */
export async function getProfileState(userId: string): Promise<{
  hasDesigner: boolean;
  hasCustomer: boolean;
  designerComplete: boolean;
  customerComplete: boolean;
}> {
  const [designer, customer] = await Promise.all([
    prisma.designerProfile.findUnique({
      where: { userId },
      select: { completedAt: true },
    }),
    prisma.customerProfile.findUnique({
      where: { userId },
      select: { completedAt: true },
    }),
  ]);

  return {
    hasDesigner: Boolean(designer),
    hasCustomer: Boolean(customer),
    designerComplete: Boolean(designer?.completedAt),
    customerComplete: Boolean(customer?.completedAt),
  };
}

/** Публичный профиль дизайнера по нику. Скрытые аккаунты не отдаём. */
export async function getPublicDesigner(nickname: string) {
  const user = await prisma.user.findUnique({
    where: { nicknameLower: nickname.toLowerCase() },
    select: {
      id: true,
      nickname: true,
      status: true,
      createdAt: true,
      lastSeenAt: true,
      designerProfile: { select: DESIGNER_PUBLIC_SELECT },
    },
  });

  if (!user?.designerProfile) return null;
  // Теневой бан: контент виден только владельцу, но это решает вызывающий код.
  if (user.status === 'banned' || user.status === 'deleted') return null;

  return { ...user, profile: user.designerProfile };
}

export async function getPublicCustomer(nickname: string) {
  const user = await prisma.user.findUnique({
    where: { nicknameLower: nickname.toLowerCase() },
    select: {
      id: true,
      nickname: true,
      status: true,
      createdAt: true,
      customerProfile: {
        select: {
          displayName: true,
          avatarUrl: true,
          type: true,
          projectLinks: true,
          bio: true,
          ordersCreated: true,
          dealsCompleted: true,
          rating: true,
          ratingCount: true,
          responsivenessScore: true,
          disputesLost: true,
        },
      },
    },
  });

  if (!user?.customerProfile) return null;
  if (user.status === 'banned' || user.status === 'deleted') return null;

  return { ...user, profile: user.customerProfile };
}

export interface DesignerCatalogFilters {
  specialization?: string;
  style?: string;
  availability?: string;
  verifiedOnly?: boolean;
  cursor?: string;
  limit?: number;
}

/**
 * Каталог дизайнеров (§4.11). Сортировка: сначала уровень, затем свежесть —
 * так верифицированные и pro попадают выше, а внутри уровня работает ротация
 * по времени последней активности.
 */
export async function listDesigners(filters: DesignerCatalogFilters) {
  const limit = Math.min(filters.limit ?? 24, 48);

  const profiles = await prisma.designerProfile.findMany({
    where: {
      // В каталог попадают только заполненные профили активных пользователей.
      completedAt: { not: null },
      user: { status: 'active' },
      ...(filters.specialization
        ? { specializations: { has: filters.specialization as never } }
        : {}),
      ...(filters.style ? { styles: { has: filters.style as never } } : {}),
      ...(filters.availability ? { availability: filters.availability as never } : {}),
      ...(filters.verifiedOnly ? { verifiedAt: { not: null } } : {}),
    },
    orderBy: [{ level: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      avatarUrl: true,
      country: true,
      specializations: true,
      styles: true,
      availability: true,
      level: true,
      hourlyRate: true,
      minBudget: true,
      currency: true,
      rating: true,
      ratingCount: true,
      ordersCompleted: true,
      user: { select: { nickname: true } },
    },
  });

  const hasMore = profiles.length > limit;
  const items = hasMore ? profiles.slice(0, limit) : profiles;

  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

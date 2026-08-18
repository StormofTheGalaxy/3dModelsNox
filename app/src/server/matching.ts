import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';
import {
  ASSET_TYPE_SPECIALIZATIONS,
  parseBriefSections,
  type ArtStyle,
  type AssetType,
  type DesignerLevel,
  type Specialization,
} from '@polyforge/shared';

import { getSetting } from './settings';

/**
 * Подбор исполнителей и заказов (§4.2, §4.5; ИИ-слой — post-MVP №4).
 *
 * Устройство одно на оба направления: кандидаты отбираются запросом по
 * тегам, а ИИ — если включён — только упорядочивает готовый список и
 * объясняет выбор. Просить модель «найти дизайнеров» нельзя: она их
 * выдумает, а проверять каждого возвращённого всё равно пришлось бы
 * запросом в базу.
 */

export interface DesignerCandidate {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: DesignerLevel;
  rating: number;
  ratingCount: number;
  ordersCompleted: number;
  onTimePct: number | null;
  specializations: Specialization[];
  styles: ArtStyle[];
  engines: string[];
  software: string[];
  minBudget: number | null;
  currency: string;
  bio: string;
  /** Совпадение по тегам, 0..100 — считается запросом, без модели. */
  tagScore: number;
  /** Уже приглашён в этот заказ. */
  invited: boolean;
}

export interface RankedDesigner extends DesignerCandidate {
  /** Итоговый балл: от ИИ, если он работал, иначе tagScore. */
  score: number;
  /** Объяснение от ИИ. Пусто — значит ранжировал не он. */
  reason: string;
}

export async function matchingEnabled(): Promise<boolean> {
  return getSetting('feature_ai_matching');
}

/** Специализации, закрывающие тип ассета заказа. */
function specializationsFor(assetType: AssetType | null): readonly Specialization[] {
  return assetType ? ASSET_TYPE_SPECIALIZATIONS[assetType] : [];
}

/**
 * Балл совпадения по тегам. Веса подобраны так, чтобы профильный новичок
 * обгонял непрофильного «топа»: платформа зарабатывает на том, что заказ
 * попадает к тому, кто это умеет, а не к тому, у кого больше звёзд.
 */
function tagScore(
  candidate: {
    specializations: Specialization[];
    styles: ArtStyle[];
    engines: string[];
    rating: number;
    ratingCount: number;
    ordersCompleted: number;
    onTimePct: number | null;
  },
  want: { specializations: readonly Specialization[]; styles: ArtStyle[]; engine: string | null },
): number {
  const specHit = want.specializations.some((item) => candidate.specializations.includes(item));

  const styleHits = want.styles.filter((style) => candidate.styles.includes(style)).length;
  const styleScore = want.styles.length > 0 ? (styleHits / want.styles.length) * 25 : 12;

  const engine = want.engine?.trim().toLowerCase() ?? '';
  const engineHit =
    engine.length > 0 && candidate.engines.some((item) => item.toLowerCase().includes(engine));

  const reputation = candidate.ratingCount > 0 ? (candidate.rating / 5) * 15 : 6;
  const onTime = candidate.onTimePct === null ? 4 : (candidate.onTimePct / 100) * 8;
  const experience = Math.min(candidate.ordersCompleted, 7);

  return Math.round(
    Math.min(
      100,
      (specHit ? 30 : 0) + styleScore + (engineHit ? 15 : engine.length > 0 ? 0 : 7) + reputation + onTime + experience,
    ),
  );
}

/**
 * Кандидаты под заказ. Жёсткий фильтр — только по тому, без чего браться
 * не за что: живой аккаунт, заполненный профиль дизайнера, открыт к
 * заказам. Остальное решает балл, а не отсев.
 */
export async function candidateDesigners(
  orderId: string,
  limit = 12,
): Promise<{ candidates: DesignerCandidate[]; order: { title: string; sections: unknown; budgetAmount: number | null; currency: string } } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      customerId: true,
      title: true,
      assetType: true,
      styles: true,
      engine: true,
      budgetAmount: true,
      budgetCurrency: true,
      invitedDesignerIds: true,
      brief: { select: { sections: true } },
    },
  });

  if (!order) return null;

  const wantSpecializations = specializationsFor(order.assetType);

  const where: Prisma.DesignerProfileWhereInput = {
    completedAt: { not: null },
    availability: 'open',
    user: { status: 'active', id: { not: order.customerId } },
  };

  // Профильных берём в первую очередь, но добираем и остальных: на узком
  // заказе профильных может не быть вовсе, и пустой список хуже неточного.
  const [onTopic, rest] = await Promise.all([
    prisma.designerProfile.findMany({
      where:
        wantSpecializations.length > 0
          ? { ...where, specializations: { hasSome: [...wantSpecializations] } }
          : where,
      take: limit * 3,
      orderBy: [{ level: 'desc' }, { rating: 'desc' }],
      select: DESIGNER_SELECT,
    }),
    prisma.designerProfile.findMany({
      where,
      take: limit * 2,
      orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
      select: DESIGNER_SELECT,
    }),
  ]);

  const seen = new Set<string>();
  const merged = [...onTopic, ...rest].filter((row) => {
    if (seen.has(row.userId)) return false;
    seen.add(row.userId);
    return true;
  });

  const want = {
    specializations: wantSpecializations,
    styles: order.styles,
    engine: order.engine,
  };

  const candidates = merged
    .map((row) => ({
      id: row.userId,
      nickname: row.user.nickname,
      avatarUrl: row.avatarUrl,
      level: row.level,
      rating: row.rating,
      ratingCount: row.ratingCount,
      ordersCompleted: row.ordersCompleted,
      onTimePct: row.onTimePct,
      specializations: row.specializations,
      styles: row.styles,
      engines: row.engines,
      software: row.software,
      minBudget: row.minBudget,
      currency: row.currency,
      bio: row.bio ?? '',
      tagScore: tagScore(row, want),
      invited: order.invitedDesignerIds.includes(row.userId),
    }))
    .sort((a, b) => b.tagScore - a.tagScore)
    .slice(0, limit);

  return {
    candidates,
    order: {
      title: order.title,
      sections: order.brief.sections,
      budgetAmount: order.budgetAmount,
      currency: order.budgetCurrency,
    },
  };
}

const DESIGNER_SELECT = {
  userId: true,
  avatarUrl: true,
  level: true,
  rating: true,
  ratingCount: true,
  ordersCompleted: true,
  onTimePct: true,
  specializations: true,
  styles: true,
  engines: true,
  software: true,
  minBudget: true,
  currency: true,
  bio: true,
  user: { select: { nickname: true } },
} satisfies Prisma.DesignerProfileSelect;

export interface MatchedOrder {
  id: string;
  title: string;
  assetType: AssetType | null;
  styles: ArtStyle[];
  engine: string | null;
  budgetMode: string;
  budgetAmount: number | null;
  budgetCurrency: string;
  deadline: Date | null;
  publishedAt: Date | null;
  invited: boolean;
  /** Совпадение по тегам профиля, 0..100. */
  score: number;
}

/**
 * «Подходящие заказы» для дашборда дизайнера (§4.2).
 *
 * ТЗ требует сортировку по свежести, поэтому балл здесь не переставляет
 * список, а отсекает нерелевантное: витрина отсортирована по времени, и
 * дашборд не должен показывать другой порядок тех же карточек.
 */
export async function matchingOrders(userId: string, limit = 6): Promise<MatchedOrder[]> {
  const profile = await prisma.designerProfile.findUnique({
    where: { userId },
    select: { specializations: true, styles: true, engines: true, completedAt: true },
  });

  if (!profile?.completedAt) return [];

  // Типы ассетов, которые закрывают специализации дизайнера — обратное
  // отображение той же таблицы.
  const assetTypes = (Object.keys(ASSET_TYPE_SPECIALIZATIONS) as AssetType[]).filter((assetType) =>
    ASSET_TYPE_SPECIALIZATIONS[assetType].some((item) => profile.specializations.includes(item)),
  );

  const orders = await prisma.order.findMany({
    where: {
      status: 'published',
      customer: { status: 'active' },
      OR: [
        ...(assetTypes.length > 0 ? [{ assetType: { in: assetTypes } }] : []),
        ...(profile.styles.length > 0 ? [{ styles: { hasSome: profile.styles } }] : []),
        { invitedDesignerIds: { has: userId } },
      ],
    },
    orderBy: { publishedAt: 'desc' },
    take: limit * 3,
    select: {
      id: true,
      title: true,
      assetType: true,
      styles: true,
      engine: true,
      budgetMode: true,
      budgetAmount: true,
      budgetCurrency: true,
      deadline: true,
      publishedAt: true,
      invitedDesignerIds: true,
    },
  });

  return orders
    .map((order) => {
      const specHit =
        order.assetType !== null &&
        ASSET_TYPE_SPECIALIZATIONS[order.assetType].some((item) =>
          profile.specializations.includes(item),
        );
      const styleHits = order.styles.filter((style) => profile.styles.includes(style)).length;
      const engine = order.engine?.trim().toLowerCase() ?? '';
      const engineHit =
        engine.length > 0 && profile.engines.some((item) => item.toLowerCase().includes(engine));

      const score = Math.min(
        100,
        (specHit ? 50 : 0) +
          (order.styles.length > 0 ? (styleHits / order.styles.length) * 30 : 15) +
          (engineHit ? 20 : 0),
      );

      return {
        id: order.id,
        title: order.title,
        assetType: order.assetType,
        styles: order.styles,
        engine: order.engine,
        budgetMode: order.budgetMode,
        budgetAmount: order.budgetAmount,
        budgetCurrency: order.budgetCurrency,
        deadline: order.deadline,
        publishedAt: order.publishedAt,
        invited: order.invitedDesignerIds.includes(userId),
        score: Math.round(score),
      };
    })
    // Приглашение перевешивает балл: его адресовали лично.
    .filter((order) => order.invited || order.score >= 30)
    .slice(0, limit);
}

/** Секции ТЗ заказа в разобранном виде — нужны и ИИ, и объяснению. */
export function orderSections(sections: unknown) {
  return parseBriefSections(sections);
}

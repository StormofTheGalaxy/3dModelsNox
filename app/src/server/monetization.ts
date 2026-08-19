import 'server-only';

import { prisma } from '@polyforge/db';
import { z } from 'zod';

import { getSetting } from './settings';

/**
 * Монетизация: подписки, буст, featured (§1.2.2, post-MVP №12).
 *
 * Продавать это нельзя: покупка требует платёжного модуля, а он требует
 * юрлица (ADR 0019). Поэтому здесь нет ни цены к оплате, ни продления —
 * есть тарифы с лимитами и продвижение, которое выдаёт администратор.
 *
 * Главное свойство то же, что у комиссий: при выключенных флагах всё
 * возвращает ровно то, что платформа возвращала раньше. Бесплатный тариф
 * не «урезанный», а описывающий сегодняшнее поведение.
 */

/**
 * Надбавки тарифа. Список закрытый: тариф может поднять известный лимит,
 * но не завести новую способность — иначе тариф превращается в скрытый
 * реестр настроек со своими правилами.
 */
export const planPerksSchema = z.object({
  /** Сколько откликов в день добавить сверх лимита уровня. */
  responsesPerDay: z.number().int().min(0).max(500).optional(),
  /** Надбавка к месячным ИИ-кредитам общего пула. */
  aiCredits: z.number().int().min(0).max(10_000).optional(),
  /** Надбавка к пулу генерации ТЗ. */
  aiBriefCredits: z.number().int().min(0).max(1000).optional(),
  /** Сколько инвайтов выдавать при выдаче тарифа. */
  invites: z.number().int().min(0).max(100).optional(),
  /** Разрешить продвигать свои заказы самостоятельно. */
  selfBoost: z.boolean().optional(),
});

export type PlanPerks = z.infer<typeof planPerksSchema>;

const NO_PERKS: PlanPerks = {};

export async function subscriptionsEnabled(): Promise<boolean> {
  return getSetting('feature_subscriptions');
}

export async function promotionsEnabled(): Promise<boolean> {
  return getSetting('feature_promotions');
}

/**
 * Действующие надбавки пользователя.
 *
 * При выключенных подписках — пусто, и все лимиты считаются как раньше.
 * Просроченная подписка тоже даёт пусто: срок кончился, значит кончился.
 */
export async function activePerks(userId: string): Promise<PlanPerks> {
  if (!(await subscriptionsEnabled())) return NO_PERKS;

  const now = new Date();
  const subscription = await prisma.userSubscription.findFirst({
    where: {
      userId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      plan: { isEnabled: true },
    },
    orderBy: { startsAt: 'desc' },
    select: { plan: { select: { perks: true } } },
  });

  if (!subscription?.plan.perks) return NO_PERKS;

  const parsed = planPerksSchema.safeParse(subscription.plan.perks);
  if (!parsed.success) {
    // Испорченный JSON в тарифе не должен ломать отклик: считаем, что
    // надбавок нет, и говорим об этом в лог.
    console.warn('[monetization] надбавки тарифа не проходят схему', parsed.error.issues);
    return NO_PERKS;
  }

  return parsed.data;
}

/** Активные продвижения по цели — для витрины и каталога. */
export async function activePromotions(
  target: 'order' | 'designer',
  kind?: 'boost' | 'featured',
): Promise<Map<string, { kind: string; endsAt: Date }>> {
  if (!(await promotionsEnabled())) return new Map();

  const rows = await prisma.promotion.findMany({
    where: {
      target,
      ...(kind ? { kind } : {}),
      startsAt: { lte: new Date() },
      endsAt: { gt: new Date() },
    },
    orderBy: { endsAt: 'desc' },
    select: { targetId: true, kind: true, endsAt: true },
  });

  const map = new Map<string, { kind: string; endsAt: Date }>();
  for (const row of rows) {
    // Первое попавшееся — с самым поздним сроком: продвижений на одну цель
    // может быть несколько, и показывать надо то, что дольше действует.
    if (!map.has(row.targetId)) map.set(row.targetId, { kind: row.kind, endsAt: row.endsAt });
  }

  return map;
}

/** Тарифы для витрины и админки. */
export async function listPlans() {
  return prisma.subscriptionPlan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }],
    select: {
      id: true,
      key: true,
      audience: true,
      priceMinor: true,
      currency: true,
      perks: true,
      isEnabled: true,
    },
  });
}

/** Текущая подписка человека — для настроек и админки. */
export async function currentSubscription(userId: string) {
  const now = new Date();

  return prisma.userSubscription.findFirst({
    where: {
      userId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: { startsAt: 'desc' },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      note: true,
      plan: { select: { key: true, priceMinor: true, currency: true } },
    },
  });
}

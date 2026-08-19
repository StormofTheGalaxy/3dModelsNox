'use server';

import { revalidatePath } from 'next/cache';

import { prisma, type PromotionKind, type PromotionTarget } from '@polyforge/db';

import { writeAuditLog } from '../audit';
import { adminOrNull } from '../auth/guards';
import {
  planPerksSchema,
  promotionsEnabled,
  subscriptionsEnabled,
} from '../monetization';

/**
 * Монетизация: выдача тарифов и продвижения (§1.2.2, post-MVP №12).
 *
 * Всё выдаёт администратор, а не покупает пользователь: покупка требует
 * платёжного модуля, а он — юрлица (ADR 0019). Поэтому у каждой выдачи
 * есть тот, кто её сделал, и запись в аудит-логе: раз нет оплаты, должен
 * быть хотя бы ответственный.
 */

type Result = { ok: true } | { ok: false; error: string };

const KINDS: PromotionKind[] = ['boost', 'featured'];
const TARGETS: PromotionTarget[] = ['order', 'designer'];

export async function grantSubscription(
  nickname: string,
  planKey: string,
  days: number,
  note: string,
): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  if (!(await subscriptionsEnabled())) {
    return { ok: false, error: 'errors.monetization.subscriptionsOff' };
  }

  if (!Number.isInteger(days) || days < 1 || days > 730) {
    return { ok: false, error: 'errors.monetization.badDays' };
  }

  const [user, plan] = await Promise.all([
    prisma.user.findUnique({
      where: { nicknameLower: nickname.trim().toLowerCase() },
      select: { id: true, status: true },
    }),
    prisma.subscriptionPlan.findUnique({ where: { key: planKey }, select: { id: true } }),
  ]);

  if (!user || user.status !== 'active') return { ok: false, error: 'errors.monetization.userNotFound' };
  if (!plan) return { ok: false, error: 'errors.notFound' };

  const now = new Date();
  const endsAt = new Date(now.getTime() + days * 86_400_000);

  await prisma.userSubscription.create({
    data: {
      userId: user.id,
      planId: plan.id,
      startsAt: now,
      endsAt,
      grantedById: admin.id,
      note: note.trim().slice(0, 200) || null,
    },
  });

  await writeAuditLog({
    action: 'subscription.granted',
    actorId: admin.id,
    targetType: 'user',
    targetId: user.id,
    payload: { plan: planKey, days },
  });

  revalidatePath('/admin/monetization');
  return { ok: true };
}

/** Досрочное прекращение: подписка кончается сейчас, а не удаляется. */
export async function endSubscription(subscriptionId: string): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  const updated = await prisma.userSubscription.updateMany({
    where: { id: subscriptionId },
    // Удалить значило бы стереть след: кто выдал, когда и на сколько.
    data: { endsAt: new Date() },
  });

  if (updated.count === 0) return { ok: false, error: 'errors.notFound' };

  await writeAuditLog({
    action: 'subscription.ended',
    actorId: admin.id,
    targetType: 'user',
    targetId: subscriptionId,
  });

  revalidatePath('/admin/monetization');
  return { ok: true };
}

export async function grantPromotion(
  kind: string,
  target: string,
  targetRef: string,
  days: number,
  note: string,
): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  if (!(await promotionsEnabled())) {
    return { ok: false, error: 'errors.monetization.promotionsOff' };
  }

  if (!KINDS.includes(kind as PromotionKind) || !TARGETS.includes(target as PromotionTarget)) {
    return { ok: false, error: 'errors.generic' };
  }

  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return { ok: false, error: 'errors.monetization.badDays' };
  }

  // Заказ адресуется идентификатором, дизайнер — ником: так их и называют
  // в админке, и заставлять искать id пользователя незачем.
  const resolved =
    target === 'order'
      ? await prisma.order.findUnique({
          where: { id: targetRef.trim() },
          select: { id: true, customerId: true, status: true },
        })
      : await prisma.user
          .findUnique({
            where: { nicknameLower: targetRef.trim().toLowerCase() },
            select: { id: true, status: true },
          })
          .then((user) =>
            user && user.status === 'active'
              ? { id: user.id, customerId: user.id, status: 'published' as const }
              : null,
          );

  if (!resolved) return { ok: false, error: 'errors.monetization.targetNotFound' };
  if (target === 'order' && resolved.status !== 'published') {
    return { ok: false, error: 'errors.order.notPublished' };
  }

  const endsAt = new Date(Date.now() + days * 86_400_000);

  await prisma.promotion.create({
    data: {
      kind: kind as PromotionKind,
      target: target as PromotionTarget,
      targetId: resolved.id,
      userId: resolved.customerId,
      endsAt,
      grantedById: admin.id,
      note: note.trim().slice(0, 200) || null,
    },
  });

  // Денормализация в заказ: сортировать поднятые заказы должна база, а
  // джойн продвижений в витрину — лишний вес на самом горячем экране.
  if (target === 'order' && kind === 'boost') {
    await prisma.order.update({ where: { id: resolved.id }, data: { boostedUntil: endsAt } });
  }

  await writeAuditLog({
    action: 'promotion.granted',
    actorId: admin.id,
    targetType: target === 'order' ? 'order' : 'user',
    targetId: resolved.id,
    payload: { kind, days },
  });

  revalidatePath('/admin/monetization');
  revalidatePath('/orders');
  return { ok: true };
}

export async function endPromotion(promotionId: string): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  const promotion = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: { id: true, kind: true, target: true, targetId: true },
  });

  if (!promotion) return { ok: false, error: 'errors.notFound' };

  await prisma.promotion.update({ where: { id: promotion.id }, data: { endsAt: new Date() } });

  if (promotion.target === 'order' && promotion.kind === 'boost') {
    await prisma.order.update({
      where: { id: promotion.targetId },
      data: { boostedUntil: null },
    });
  }

  await writeAuditLog({
    action: 'promotion.ended',
    actorId: admin.id,
    targetType: promotion.target === 'order' ? 'order' : 'user',
    targetId: promotion.targetId,
  });

  revalidatePath('/admin/monetization');
  revalidatePath('/orders');
  return { ok: true };
}

/** Правка надбавок тарифа. Цена отдельно: продавать пока нечем. */
export async function updatePlanPerks(planId: string, perks: unknown): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  const parsed = planPerksSchema.safeParse(perks);
  if (!parsed.success) return { ok: false, error: 'errors.monetization.badPerks' };

  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { perks: parsed.data },
  });

  await writeAuditLog({
    action: 'plan.updated',
    actorId: admin.id,
    targetType: 'plan',
    targetId: planId,
    payload: parsed.data,
  });

  revalidatePath('/admin/monetization');
  return { ok: true };
}

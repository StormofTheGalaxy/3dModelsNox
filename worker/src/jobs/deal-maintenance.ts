import { prisma } from '@polyforge/db';

import { notifyUser } from '../notify';

/**
 * Регулярные задачи по сделкам (§4.6).
 *
 * Дедлайны и зависшие оплаты — два места, где сделка тихо умирает: одна
 * сторона ждёт, вторая забыла. Напоминания дешевле любого спора.
 */

/**
 * Напоминания о приближающемся дедлайне этапа.
 *
 * `hoursBefore` приходит из настроек платформы (по умолчанию 48 и 24 часа).
 * Повторно не шлём: `remindedAt` на этапе двигается после каждой отправки.
 */
export async function remindMilestoneDeadlines(hoursBefore: number[]): Promise<number> {
  const now = Date.now();
  let sent = 0;

  for (const hours of hoursBefore) {
    const windowStart = new Date(now + (hours - 1) * 3600_000);
    const windowEnd = new Date(now + hours * 3600_000);

    const due = await prisma.milestone.findMany({
      where: {
        status: { in: ['in_work', 'revision'] },
        dueDate: { gte: windowStart, lt: windowEnd },
        deal: { status: 'active' },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        deal: { select: { id: true, title: true, designerId: true, customerId: true } },
      },
      take: 300,
    });

    for (const milestone of due) {
      await notifyUser({
        userId: milestone.deal.designerId,
        type: 'deal_deadline_soon',
        payload: {
          dealTitle: milestone.deal.title,
          milestoneTitle: milestone.title,
          hours,
        },
        link: `/deals/${milestone.deal.id}`,
        withEmail: true,
      });

      sent += 1;
    }
  }

  return sent;
}

/**
 * Заказчик прислал чек, дизайнер не подтвердил получение.
 *
 * Пороги — из настроек (по умолчанию 1 и 3 дня). После последнего напоминания
 * оплата помечается зависшей и попадает в админку: платформа денег не видит и
 * рассудить сама не может, но заметить молчание обязана.
 */
export async function remindStuckPayments(reminderDays: number[]): Promise<number> {
  const maxDays = Math.max(...reminderDays);
  const now = Date.now();
  let handled = 0;

  const pending = await prisma.paymentConfirmation.findMany({
    where: { status: 'pending', designerConfirmedAt: null },
    select: {
      id: true,
      customerClaimedAt: true,
      reminderCount: true,
      amount: true,
      currency: true,
      milestone: {
        select: {
          title: true,
          deal: { select: { id: true, title: true, designerId: true, customerId: true } },
        },
      },
    },
    take: 500,
  });

  for (const payment of pending) {
    const ageDays = (now - payment.customerClaimedAt.getTime()) / 86_400_000;
    // Сколько напоминаний уже заслужено по возрасту заявки.
    const due = reminderDays.filter((days) => ageDays >= days).length;
    if (due <= payment.reminderCount) continue;

    await notifyUser({
      userId: payment.milestone.deal.designerId,
      type: 'deal_payment_stuck',
      payload: {
        dealTitle: payment.milestone.deal.title,
        milestoneTitle: payment.milestone.title,
        amount: payment.amount,
        currency: payment.currency,
      },
      link: `/deals/${payment.milestone.deal.id}`,
      withEmail: true,
    });

    const exhausted = ageDays >= maxDays;

    await prisma.paymentConfirmation.update({
      where: { id: payment.id },
      data: {
        reminderCount: due,
        remindedAt: new Date(),
        // Дальше напоминать некому — это уже работа модерации.
        ...(exhausted ? { status: 'stuck' as const, adminCheck: 'flagged' as const } : {}),
      },
    });

    handled += 1;
  }

  return handled;
}

/**
 * Доля этапов, сданных в срок, — метрика профиля дизайнера (§3).
 *
 * Считается по всем сданным этапам за всю историю: разовая просрочка не
 * должна перечёркивать репутацию, а систематическая — обязана быть видна.
 */
export async function recomputeOnTimeMetrics(): Promise<number> {
  const grouped = await prisma.milestone.groupBy({
    by: ['dealId'],
    where: { submittedAt: { not: null } },
    _count: { _all: true },
  });

  if (grouped.length === 0) return 0;

  const deals = await prisma.deal.findMany({
    where: { id: { in: grouped.map((row) => row.dealId) } },
    select: { designerId: true, milestones: { select: { submittedAt: true, wasLate: true } } },
  });

  const stats = new Map<string, { total: number; onTime: number }>();

  for (const deal of deals) {
    const entry = stats.get(deal.designerId) ?? { total: 0, onTime: 0 };

    for (const milestone of deal.milestones) {
      if (!milestone.submittedAt) continue;
      entry.total += 1;
      if (!milestone.wasLate) entry.onTime += 1;
    }

    stats.set(deal.designerId, entry);
  }

  let updated = 0;

  for (const [designerId, entry] of stats) {
    if (entry.total === 0) continue;

    await prisma.designerProfile
      .updateMany({
        where: { userId: designerId },
        data: { onTimePct: Math.round((entry.onTime / entry.total) * 100) },
      })
      .catch(() => undefined);

    updated += 1;
  }

  return updated;
}

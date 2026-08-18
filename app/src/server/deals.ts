import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';
import { parseBriefSections, type SystemMessageKey } from '@polyforge/shared';

/**
 * Сделки (§4.6): доступ, чтение, системные события ленты.
 *
 * Правило доступа одно на весь модуль: сделку видят только её участники
 * и админ-роли. Всё остальное — производные от него.
 */

const DEAL_SELECT = {
  id: true,
  orderId: true,
  briefVersionId: true,
  customerId: true,
  designerId: true,
  title: true,
  price: true,
  currency: true,
  revisionRoundsIncluded: true,
  status: true,
  planConfirmedByCustomerAt: true,
  planConfirmedByDesignerAt: true,
  pausedAt: true,
  pauseReason: true,
  completedAt: true,
  cancelledAt: true,
  portfolioAllowed: true,
  createdAt: true,
  customer: { select: { id: true, nickname: true, customerProfile: { select: { displayName: true, avatarUrl: true } } } },
  designer: { select: { id: true, nickname: true, designerProfile: { select: { avatarUrl: true, level: true } } } },
  briefVersion: { select: { id: true, version: true, title: true, sections: true, briefId: true } },
  milestones: {
    orderBy: { position: 'asc' as const },
    select: {
      id: true,
      position: true,
      title: true,
      description: true,
      amount: true,
      currency: true,
      dueDate: true,
      status: true,
      revisionRoundsUsed: true,
      submittedAt: true,
      acceptedAt: true,
      wasLate: true,
    },
  },
  dispute: { select: { id: true, status: true, verdict: true, openedById: true, reason: true } },
} satisfies Prisma.DealSelect;

export type DealRole = 'customer' | 'designer' | 'staff';

export async function getDealForUser(
  dealId: string,
  userId: string,
  isStaffUser = false,
): Promise<{ deal: Prisma.DealGetPayload<{ select: typeof DEAL_SELECT }>; role: DealRole } | null> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: DEAL_SELECT });
  if (!deal) return null;

  if (deal.customerId === userId) return { deal, role: 'customer' };
  if (deal.designerId === userId) return { deal, role: 'designer' };
  // Арбитр и модератор видят сделку целиком — это их рабочий материал (§4.6).
  if (isStaffUser) return { deal, role: 'staff' };

  return null;
}

export async function listUserDeals(userId: string) {
  return prisma.deal.findMany({
    where: { OR: [{ customerId: userId }, { designerId: userId }] },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      status: true,
      price: true,
      currency: true,
      customerId: true,
      designerId: true,
      createdAt: true,
      customer: { select: { nickname: true } },
      designer: { select: { nickname: true } },
      milestones: { select: { id: true, status: true, amount: true } },
    },
  });
}

/** Замороженный снимок ТЗ: панель сделки показывает именно его. */
export function dealBriefSections(deal: { briefVersion: { sections: unknown } }) {
  return parseBriefSections(deal.briefVersion.sections);
}

/**
 * Прогресс сделки в деньгах: сколько этапов закрыто подтверждённой оплатой.
 * Считается по этапам, а не по проценту статусов — деньги и есть смысл сделки.
 */
export function dealProgress(milestones: { status: string; amount: number }[]): {
  paid: number;
  total: number;
  percent: number;
} {
  const total = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  const paid = milestones
    .filter((milestone) => milestone.status === 'paid_confirmed')
    .reduce((sum, milestone) => sum + milestone.amount, 0);

  return { paid, total, percent: total === 0 ? 0 : Math.round((paid / total) * 100) };
}

/**
 * Системное сообщение в ленту сделки (§4.7).
 *
 * Пишется тем же потоком, что и реплики пользователей: события и разговор
 * должны читаться единой хронологией, иначе восстановить ход дела в споре
 * невозможно.
 */
export async function postSystemMessage(
  dealId: string,
  key: SystemMessageKey,
  payload: Record<string, string | number> = {},
): Promise<void> {
  await prisma.dealMessage.create({
    data: {
      dealId,
      kind: 'system',
      text: '',
      systemKey: key,
      systemPayload: payload as Prisma.InputJsonValue,
    },
  });
}

/** Финальный этап — по нему открываются исходники (§4.6). */
export function finalMilestone<T extends { position: number }>(milestones: T[]): T | undefined {
  return milestones.reduce<T | undefined>(
    (latest, milestone) => (!latest || milestone.position > latest.position ? milestone : latest),
    undefined,
  );
}

/**
 * Может ли заказчик забрать исходники: только после подтверждённой оплаты
 * финального этапа. До этого он видит превью (§4.6).
 */
export function sourcesUnlocked(milestones: { position: number; status: string }[]): boolean {
  const final = finalMilestone(milestones);
  return final?.status === 'paid_confirmed';
}

export async function listDealMessages(dealId: string, limit = 200) {
  return prisma.dealMessage.findMany({
    where: { dealId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      kind: true,
      text: true,
      systemKey: true,
      systemPayload: true,
      quotedMessageId: true,
      pinned: true,
      authorId: true,
      createdAt: true,
      author: { select: { nickname: true } },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, previewUrl: true },
      },
    },
  });
}

export async function getMilestoneWithDeal(milestoneId: string) {
  return prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: {
      id: true,
      dealId: true,
      position: true,
      title: true,
      amount: true,
      currency: true,
      dueDate: true,
      status: true,
      revisionRoundsUsed: true,
      deal: {
        select: {
          id: true,
          orderId: true,
          customerId: true,
          designerId: true,
          status: true,
          title: true,
          revisionRoundsIncluded: true,
          milestones: { select: { id: true, position: true, status: true } },
        },
      },
    },
  });
}

export async function listMilestoneDeliveries(milestoneId: string) {
  return prisma.delivery.findMany({
    where: { milestoneId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      note: true,
      createdAt: true,
      files: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          isSource: true,
          previewUrl: true,
          watermarkedUrl: true,
          watermarkPending: true,
        },
      },
    },
  });
}

export async function listMilestonePayments(milestoneId: string) {
  return prisma.paymentConfirmation.findMany({
    where: { milestoneId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      txHash: true,
      note: true,
      status: true,
      customerClaimedAt: true,
      designerConfirmedAt: true,
      files: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
  });
}

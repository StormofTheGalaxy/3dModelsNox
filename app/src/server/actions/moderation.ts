'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { strikeSchema } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser, isStaff } from '../auth/session';
import { issueStrike } from '../moderation';
import { notify } from '../notifications';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Модерация (§3, §4.10): разбор жалоб, страйки, баны.
 *
 * Теневой бан отделён от обычного намеренно: он не сообщает пользователю
 * ничего и потому не годится как наказание за спорное нарушение — только
 * против спама, где объяснение всё равно никто не читает.
 */

/** Разбор жалобы. Подтверждение автоматически выдаёт страйк (§3). */
export async function resolveReport(
  reportId: string,
  confirm: boolean,
  note = '',
): Promise<{ ok: boolean; error?: string; banned?: boolean }> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return { ok: false, error: 'errors.forbidden' };

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, targetType: true, targetId: true, category: true },
  });

  if (!report) return { ok: false, error: 'errors.notFound' };
  if (report.status !== 'open') return { ok: false, error: 'errors.report.alreadyResolved' };

  await prisma.report.update({
    where: { id: report.id },
    data: {
      status: confirm ? 'confirmed' : 'rejected',
      resolvedById: user.id,
      resolvedAt: new Date(),
      resolutionNote: note.slice(0, 1000) || null,
    },
  });

  if (!confirm) {
    await writeAuditLog({
      action: 'report.rejected',
      actorId: user.id,
      targetType: 'report',
      targetId: report.id,
    });
    revalidatePath('/admin/reports');
    return { ok: true };
  }

  // Кому выдавать страйк, зависит от объекта жалобы: у работы и у ТЗ автор
  // разный, а жалоба на пользователя указывает на него напрямую.
  const offenderId = await resolveOffender(report.targetType, report.targetId);

  if (!offenderId) {
    await writeAuditLog({
      action: 'report.confirmed',
      actorId: user.id,
      targetType: 'report',
      targetId: report.id,
      payload: { offender: null },
    });
    revalidatePath('/admin/reports');
    return { ok: true };
  }

  const outcome = await issueStrike({
    userId: offenderId,
    reason: report.category,
    note,
    reportId: report.id,
    issuedById: user.id,
  });

  await notify({
    userId: offenderId,
    type: 'strike_issued',
    payload: { reason: report.category, count: outcome.activeStrikes },
    link: '/settings',
    push: true,
  });

  await writeAuditLog({
    action: 'strike.issued',
    actorId: user.id,
    targetType: 'user',
    targetId: offenderId,
    payload: { reportId: report.id, strikes: outcome.activeStrikes, banned: outcome.banned },
  });

  revalidatePath('/admin/reports');
  return { ok: true, banned: outcome.banned };
}

/** Автор объекта жалобы. `null` — объект уже удалён либо автора у него нет. */
async function resolveOffender(targetType: string, targetId: string): Promise<string | null> {
  if (targetType === 'user') return targetId;

  if (targetType === 'work') {
    const work = await prisma.portfolioWork.findUnique({
      where: { id: targetId },
      select: { designerId: true },
    });
    return work?.designerId ?? null;
  }

  if (targetType === 'order') {
    const order = await prisma.order.findUnique({
      where: { id: targetId },
      select: { customerId: true },
    });
    return order?.customerId ?? null;
  }

  if (targetType === 'brief') {
    const brief = await prisma.brief.findUnique({
      where: { id: targetId },
      select: { ownerId: true },
    });
    return brief?.ownerId ?? null;
  }

  if (targetType === 'message') {
    const message = await prisma.dealMessage.findUnique({
      where: { id: targetId },
      select: { authorId: true },
    });
    return message?.authorId ?? null;
  }

  if (targetType === 'review') {
    const review = await prisma.review.findUnique({
      where: { id: targetId },
      select: { authorId: true },
    });
    return review?.authorId ?? null;
  }

  return null;
}

/** Ручной страйк без жалобы — модератор увидел нарушение сам. */
export async function grantStrike(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return errorState('errors.forbidden');

  const parsed = strikeSchema.safeParse({
    userId: formData.get('userId') ?? '',
    reason: formData.get('reason') ?? '',
    note: formData.get('note') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const outcome = await issueStrike({
    userId: parsed.data.userId,
    reason: parsed.data.reason,
    note: parsed.data.note,
    issuedById: user.id,
  });

  await notify({
    userId: parsed.data.userId,
    type: 'strike_issued',
    payload: { reason: parsed.data.reason, count: outcome.activeStrikes },
    link: '/settings',
    push: true,
  });

  await writeAuditLog({
    action: 'strike.issued',
    actorId: user.id,
    targetType: 'user',
    targetId: parsed.data.userId,
    payload: { strikes: outcome.activeStrikes, banned: outcome.banned },
  });

  revalidatePath('/admin/users');
  return successState({ message: 'settings.saved', values: { count: outcome.activeStrikes } });
}

/** Отзыв страйка: модератор ошибся или нарушение оспорено. */
export async function revokeStrike(strikeId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return { ok: false, error: 'errors.forbidden' };

  const strike = await prisma.strike.findUnique({
    where: { id: strikeId },
    select: { id: true, userId: true, status: true },
  });

  if (!strike) return { ok: false, error: 'errors.notFound' };
  if (strike.status !== 'active') return { ok: false, error: 'errors.generic' };

  await prisma.strike.update({ where: { id: strike.id }, data: { status: 'revoked' } });

  await writeAuditLog({
    action: 'strike.revoked',
    actorId: user.id,
    targetType: 'user',
    targetId: strike.userId,
    payload: { strikeId: strike.id },
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

/**
 * Бан, теневой бан и разбан (§4.10).
 *
 * Теневой бан не отзывает сессии: пользователь должен продолжать пользоваться
 * платформой, не замечая, что его не видно, — иначе смысл теряется.
 */
export async function setUserStatus(
  userId: string,
  status: 'active' | 'shadow_banned' | 'banned',
  reason = '',
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return { ok: false, error: 'errors.forbidden' };
  if (userId === user.id) return { ok: false, error: 'errors.moderation.selfAction' };

  await prisma.user.update({
    where: { id: userId },
    data: {
      status,
      banReason: status === 'active' ? null : reason.slice(0, 500) || null,
      banUntil: null,
    },
  });

  if (status === 'banned') {
    await prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await writeAuditLog({
    action: status === 'active' ? 'user.unbanned' : 'user.banned',
    actorId: user.id,
    targetType: 'user',
    targetId: userId,
    payload: { status, reason: reason.slice(0, 200) },
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

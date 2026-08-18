'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { DESIGNER_LEVELS, SETTINGS_REGISTRY, type SettingKey } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser, isStaff } from '../auth/session';
import { sendInviteEmail } from '../mail';
import { notify } from '../notifications';
import { enqueueBroadcast } from '../queue';
import { invalidateSettingsCache } from '../settings';
import { errorState, successState, type ActionState } from './types';

/**
 * Управление платформой (§4.10).
 *
 * Всё, что здесь есть, суперадмин делает без доступа к коду — это и есть
 * критерий приёмки фазы. Поэтому каждое действие пишет в аудит-лог: разбор
 * «кто это сделал» не должен требовать чтения серверных логов.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === 'admin' ? user : null;
}

/** Уровень дизайнера вручную: `top` выдаётся только так (§3). */
export async function setDesignerLevel(
  userId: string,
  level: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  if (!(DESIGNER_LEVELS as readonly string[]).includes(level)) {
    return { ok: false, error: 'errors.generic' };
  }

  const updated = await prisma.designerProfile.updateMany({
    where: { userId },
    data: {
      level: level as (typeof DESIGNER_LEVELS)[number],
      // Ручной `verified` без пройденной проверки не выдаётся: бейдж
      // означает конкретную процедуру, а не расположение админа.
      ...(level === 'novice' ? { verifiedAt: null } : {}),
    },
  });

  if (updated.count === 0) return { ok: false, error: 'errors.notFound' };

  await notify({
    userId,
    type: 'level_changed',
    payload: { level },
    link: '/profile/designer',
    withEmail: true,
  });

  await writeAuditLog({
    action: 'user.level_changed',
    actorId: admin.id,
    targetType: 'user',
    targetId: userId,
    payload: { level },
  });

  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

/** Выдача инвайтов сверх обычного лимита. */
export async function grantInvites(
  userId: string,
  count: number,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  const amount = Math.max(1, Math.min(100, Math.round(count)));

  const user = await prisma.user.update({
    where: { id: userId },
    data: { invitesLeft: { increment: amount } },
    select: { invitesLeft: true },
  });

  await prisma.invite.createMany({
    data: Array.from({ length: amount }, () => ({
      code: randomBytes(6).toString('hex'),
      ownerId: userId,
    })),
  });

  await writeAuditLog({
    action: 'invite.granted_by_admin',
    actorId: admin.id,
    targetType: 'user',
    targetId: userId,
    payload: { amount, total: user.invitesLeft },
  });

  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

/**
 * Правка настройки платформы (§4.10).
 *
 * Значение валидируется схемой из реестра, а не принимается как есть:
 * админка отдаёт строку из формы, а в БД должен лечь типизированный JSON.
 */
export async function updateSetting(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return errorState('errors.forbidden');

  const key = String(formData.get('key') ?? '') as SettingKey;
  const definition = SETTINGS_REGISTRY[key];
  if (!definition) return errorState('errors.notFound');

  const raw = String(formData.get('value') ?? '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Строковые настройки админ вводит без кавычек — это нормально.
    parsed = raw;
  }

  const result = definition.schema.safeParse(parsed);
  if (!result.success) {
    return errorState('errors.settings.invalidValue', {
      values: { message: result.error.issues[0]?.message ?? '' },
    });
  }

  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: result.data as never, updatedById: admin.id },
    update: { value: result.data as never, updatedById: admin.id },
  });

  await invalidateSettingsCache();

  await writeAuditLog({
    action: 'setting.changed',
    actorId: admin.id,
    targetType: 'setting',
    targetId: key,
    payload: { value: JSON.stringify(result.data).slice(0, 500) },
  });

  revalidatePath('/admin/settings');
  return successState({ message: 'settings.saved' });
}

/** Снятие заказа с витрины модератором (§4.10). */
export async function unpublishOrder(
  orderId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return { ok: false, error: 'errors.forbidden' };

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'archived' },
    select: { customerId: true, title: true },
  });

  await notify({
    userId: order.customerId,
    type: 'system',
    payload: { orderTitle: order.title },
    link: '/orders/mine',
    withEmail: true,
  });

  await writeAuditLog({
    action: 'order.archived',
    actorId: user.id,
    targetType: 'order',
    targetId: orderId,
    payload: { reason: reason.slice(0, 200) },
  });

  revalidatePath('/admin/orders');
  return { ok: true };
}

/** Пометка чека проверенным или подозрительным (§4.10). */
export async function reviewPayment(
  paymentId: string,
  verdict: 'verified' | 'flagged',
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return { ok: false, error: 'errors.forbidden' };

  await prisma.paymentConfirmation.update({
    where: { id: paymentId },
    data: { adminCheck: verdict },
  });

  await writeAuditLog({
    action: 'payment.flagged',
    actorId: user.id,
    targetType: 'payment',
    targetId: paymentId,
    payload: { verdict },
  });

  revalidatePath('/admin/payments');
  return { ok: true };
}

/** «Дизайнер недели» на главной (§4.8). */
export async function setFeaturedDesigner(
  nickname: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  const trimmed = nickname.trim();

  const userId = trimmed
    ? (
        await prisma.user.findUnique({
          where: { nicknameLower: trimmed.toLowerCase() },
          select: { id: true, designerProfile: { select: { id: true } } },
        })
      )
    : null;

  if (trimmed && !userId?.designerProfile) return { ok: false, error: 'errors.notFound' };

  await prisma.platformSetting.upsert({
    where: { key: 'featured_designer_userId' },
    create: {
      key: 'featured_designer_userId',
      value: userId?.id ?? '',
      updatedById: admin.id,
    },
    update: { value: userId?.id ?? '', updatedById: admin.id },
  });

  await invalidateSettingsCache();

  await writeAuditLog({
    action: 'content.updated',
    actorId: admin.id,
    targetType: 'user',
    targetId: userId?.id ?? 'none',
  });

  revalidatePath('/admin/content');
  revalidatePath('/top');
  return { ok: true };
}

/**
 * Рассылка инвайтов из листа ожидания (§4.10, §4.11).
 *
 * Инвайт создаётся системным (без владельца) и привязывается к записи листа
 * ожидания: так видно, кто из ожидающих уже приглашён, и повторная рассылка
 * не выдаёт второй код тому же человеку.
 */
export async function inviteFromWaitlist(
  entryIds: string[],
): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  const entries = await prisma.waitlistEntry.findMany({
    where: { id: { in: entryIds.slice(0, 200) }, invitedAt: null },
    select: { id: true, email: true, locale: true },
  });

  if (entries.length === 0) return { ok: true, sent: 0 };

  const expiresDays = 30;
  let sent = 0;

  for (const entry of entries) {
    const code = randomBytes(6).toString('hex');

    try {
      const invite = await prisma.invite.create({
        data: {
          code,
          expiresAt: new Date(Date.now() + expiresDays * 86_400_000),
        },
        select: { id: true },
      });

      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { invitedAt: new Date(), inviteId: invite.id },
      });

      await sendInviteEmail(entry.email, entry.locale as 'ru' | 'en', code);
      sent += 1;
    } catch (error) {
      // Один сбойный адрес не должен останавливать всю рассылку.
      console.error('[admin] инвайт из листа ожидания не ушёл', error);
    }
  }

  await writeAuditLog({
    action: 'invite.granted_by_admin',
    actorId: admin.id,
    targetType: 'invite',
    targetId: 'waitlist',
    payload: { requested: entryIds.length, sent },
  });

  revalidatePath('/admin/invites');
  return { ok: true, sent };
}

/**
 * Правка правового документа (§4.10).
 *
 * Markdown, а не HTML: разметку правит человек без разработчика, и
 * возможность вставить произвольный HTML в страницу, которую читают все,
 * — это готовая XSS-дыра.
 */
export async function saveLegalDocument(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return errorState('errors.forbidden');

  const slug = String(formData.get('slug') ?? '');
  const locale = String(formData.get('locale') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();

  if (!['terms', 'privacy', 'rules'].includes(slug)) return errorState('errors.notFound');
  if (!['ru', 'en'].includes(locale)) return errorState('errors.notFound');
  if (title.length < 3) return errorState('errors.legal.titleRequired');
  if (body.length < 100) return errorState('errors.legal.bodyTooShort');

  await prisma.legalDocument.upsert({
    where: { slug_locale: { slug, locale: locale as 'ru' | 'en' } },
    create: {
      slug,
      locale: locale as 'ru' | 'en',
      title,
      body,
      updatedById: admin.id,
    },
    update: { title, body, updatedById: admin.id },
  });

  await writeAuditLog({
    action: 'legal.updated',
    actorId: admin.id,
    targetType: 'setting',
    targetId: `${slug}:${locale}`,
  });

  revalidatePath('/admin/content');
  revalidatePath(`/${locale}/legal/${slug}`);
  return successState({ message: 'settings.saved' });
}

/**
 * Ручная рассылка сегменту (§4.10).
 *
 * Админка только ставит задачу: письмо тысяче адресатов не помещается в один
 * запрос, а прогресс должен переживать перезагрузку страницы. Отправляет воркер.
 */
export async function createBroadcast(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return errorState('errors.forbidden');

  const segment = String(formData.get('segment') ?? 'all');
  const localeFilter = String(formData.get('locale') ?? '');
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();

  if (!['all', 'designers', 'customers', 'waitlist'].includes(segment)) {
    return errorState('errors.notFound');
  }
  if (subject.length < 3) return errorState('errors.broadcast.subjectRequired');
  if (body.length < 20) return errorState('errors.broadcast.bodyTooShort');

  const broadcast = await prisma.broadcast.create({
    data: {
      segment: segment as 'all' | 'designers' | 'customers' | 'waitlist',
      locale: localeFilter === 'ru' || localeFilter === 'en' ? localeFilter : null,
      subject,
      body,
      authorId: admin.id,
    },
    select: { id: true },
  });

  await enqueueBroadcast({ broadcastId: broadcast.id });

  await writeAuditLog({
    action: 'admin.broadcast_sent',
    actorId: admin.id,
    targetType: 'setting',
    targetId: broadcast.id,
    payload: { segment, subject: subject.slice(0, 120) },
  });

  revalidatePath('/admin/broadcasts');
  return successState({ message: 'admin.broadcasts.queued' });
}

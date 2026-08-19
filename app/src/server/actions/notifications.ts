'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { NOTIFICATION_TYPES } from '@polyforge/shared';

import { getCurrentUser } from '../auth/session';
import { markAllRead } from '../notifications';

/** Действия над уведомлениями (§4.7). */

export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await markAllRead(user.id);
  revalidatePath('/notifications');

  return { ok: true };
}

export async function markNotificationRead(notificationId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return { ok: result.count > 0 };
}

/** Подписки по типам уведомлений (§4.7). */
export async function setNotificationPreference(
  type: string,
  channel: 'inApp' | 'email' | 'telegram' | 'webPush',
  enabled: boolean,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) return { ok: false };

  const notificationType = type as (typeof NOTIFICATION_TYPES)[number];

  // Остальные каналы при создании записи остаются включёнными: отключают
  // ровно то, о чём попросили, а не всё разом.
  await prisma.notificationPreference.upsert({
    where: { userId_type: { userId: user.id, type: notificationType } },
    update: { [channel]: enabled },
    create: {
      userId: user.id,
      type: notificationType,
      inApp: channel === 'inApp' ? enabled : true,
      email: channel === 'email' ? enabled : true,
      telegram: channel === 'telegram' ? enabled : true,
      webPush: channel === 'webPush' ? enabled : true,
    },
  });

  revalidatePath('/settings');
  return { ok: true };
}

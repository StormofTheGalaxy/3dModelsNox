'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { pushEnabled } from '../push';
import { checkRateLimit } from '../ratelimit';

/**
 * Подписка браузера на пуши (§4.7, post-MVP №8).
 *
 * Разрешение спрашивает сам браузер, и переспросить его нельзя: отказ
 * запоминается до тех пор, пока человек не отменит его в настройках сайта
 * вручную. Поэтому подписка оформляется только по явному нажатию, а не при
 * загрузке страницы «на всякий случай».
 */

interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export async function savePushSubscription(
  input: SubscriptionInput,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await pushEnabled())) return { ok: false, error: 'errors.push.disabled' };

  const endpoint = input.endpoint.trim();
  // Адрес выдаёт сервис доставки браузера, и это всегда https-URL. Всё
  // остальное сюда прийти может только в обход интерфейса.
  if (!endpoint.startsWith('https://') || endpoint.length > 1000) {
    return { ok: false, error: 'errors.generic' };
  }
  if (!input.p256dh || !input.auth) return { ok: false, error: 'errors.generic' };

  const limit = await checkRateLimit('push_subscribe', user.id);
  if (!limit.allowed) return { ok: false, error: 'errors.rateLimited' };

  // Один и тот же адрес может достаться другому аккаунту на общем
  // устройстве: тогда подписка переезжает, а не задваивается.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: user.id,
      endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
    update: {
      userId: user.id,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });

  await writeAuditLog({
    action: 'push.subscribed',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
  });

  revalidatePath('/settings');
  return { ok: true };
}

/** Отписка этого устройства. Остальные продолжают получать уведомления. */
export async function removePushSubscription(
  endpoint: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });

  await writeAuditLog({
    action: 'push.unsubscribed',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
  });

  revalidatePath('/settings');
  return { ok: true };
}

/** Удаление подписки по идентификатору — из списка устройств в настройках. */
export async function removePushDevice(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const deleted = await prisma.pushSubscription.deleteMany({ where: { id, userId: user.id } });
  if (deleted.count === 0) return { ok: false, error: 'errors.notFound' };

  await writeAuditLog({
    action: 'push.unsubscribed',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
  });

  revalidatePath('/settings');
  return { ok: true };
}

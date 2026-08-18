'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';

import { writeAuditLog } from '../audit';
import { generateToken, hashToken } from '../auth/tokens';
import { getCurrentUser } from '../auth/session';
import { checkRateLimit } from '../ratelimit';
import { linkDeepLink, telegramEnabled } from '../telegram';

/**
 * Привязка Telegram к аккаунту (§3, post-MVP №2).
 *
 * Диплинк с одноразовым токеном, а не ручной ввод кода в боте: код,
 * который человек переписывает руками, ошибаются вводить, а ссылка
 * открывает нужный чат сразу.
 */

const LINK_TTL_MINUTES = 15;

export async function createTelegramLink(): Promise<
  { ok: true; url: string; expiresInMinutes: number } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await telegramEnabled())) return { ok: false, error: 'errors.telegram.disabled' };

  const limit = await checkRateLimit('telegram_link', user.id);
  if (!limit.allowed) return { ok: false, error: 'errors.rateLimited' };

  // Старые неиспользованные ссылки гасим: живой должна быть одна.
  await prisma.authToken.deleteMany({
    where: { userId: user.id, type: 'telegram_link', usedAt: null },
  });

  const token = generateToken();

  await prisma.authToken.create({
    data: {
      type: 'telegram_link',
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + LINK_TTL_MINUTES * 60 * 1000),
    },
  });

  return { ok: true, url: linkDeepLink(token), expiresInMinutes: LINK_TTL_MINUTES };
}

/** Отвязать чат. Уведомления возвращаются в колокольчик и почту. */
export async function unlinkTelegram(): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null },
  });

  await writeAuditLog({
    action: 'telegram.unlinked',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
  });

  revalidatePath('/settings');
  return { ok: true };
}

/** Общий выключатель канала, не трогая привязку. */
export async function setTelegramNotifications(enabled: boolean): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramNotifications: enabled },
  });

  revalidatePath('/settings');
  return { ok: true };
}

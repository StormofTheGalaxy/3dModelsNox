import 'server-only';

import { prisma } from '@polyforge/db';

import { generateInviteCode } from './auth/tokens';
import { getSetting } from './settings';

/**
 * Инвайт-гейт закрытой беты (§1.2.7, §4.1).
 */

export type InviteCheck =
  | { ok: true; inviteId: string; ownerId: string | null }
  | { ok: false; error: 'errors.invite.notFound' | 'errors.invite.alreadyUsed' };

export async function checkInviteCode(code: string): Promise<InviteCheck> {
  const invite = await prisma.invite.findUnique({
    where: { code },
    select: { id: true, ownerId: true, usedById: true, expiresAt: true },
  });

  if (!invite) return { ok: false, error: 'errors.invite.notFound' };
  if (invite.usedById) return { ok: false, error: 'errors.invite.alreadyUsed' };
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return { ok: false, error: 'errors.invite.notFound' };
  }

  return { ok: true, inviteId: invite.id, ownerId: invite.ownerId };
}

/**
 * Атомарно закрепляет инвайт за новым пользователем.
 * Условие `usedById: null` в WHERE не даёт двум регистрациям занять один код.
 */
export async function consumeInvite(inviteId: string, userId: string): Promise<boolean> {
  const result = await prisma.invite.updateMany({
    where: { id: inviteId, usedById: null },
    data: { usedById: userId, usedAt: new Date() },
  });

  return result.count === 1;
}

/** Выдаёт пользователю пачку кодов и синхронизирует счётчик invitesLeft. */
export async function issueInvites(
  userId: string,
  count: number,
  options: { note?: string } = {},
): Promise<string[]> {
  if (count <= 0) return [];

  const codes: string[] = [];

  for (let index = 0; index < count; index += 1) {
    // Коллизия кода теоретически возможна — повторяем до успеха.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateInviteCode();
      try {
        await prisma.invite.create({
          data: { code, ownerId: userId, note: options.note ?? null },
        });
        codes.push(code);
        break;
      } catch {
        if (attempt === 4) throw new Error('Не удалось сгенерировать уникальный инвайт-код');
      }
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { invitesLeft: { increment: codes.length } },
  });

  return codes;
}

/** Стартовая пачка инвайтов новому пользователю — размер задаётся настройкой. */
export async function issueDefaultInvites(userId: string): Promise<string[]> {
  const count = await getSetting('invites_default');
  return issueInvites(userId, count);
}

export async function listUserInvites(userId: string) {
  return prisma.invite.findMany({
    where: { ownerId: userId },
    orderBy: [{ usedAt: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      code: true,
      usedAt: true,
      createdAt: true,
      usedBy: { select: { id: true, nickname: true } },
    },
  });
}

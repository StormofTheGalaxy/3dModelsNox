import { prisma } from '@polyforge/db';

/**
 * Истечение страйков и снятие временных банов (§3).
 *
 * Отдельным прогоном, а не проверкой при входе: пользователь должен
 * перестать быть забаненным сам по себе, даже если не заходит на платформу —
 * иначе бан на неделю превращается в бессрочный для тех, кто ушёл переждать.
 */
export async function expireStrikesAndBans(): Promise<{ strikes: number; bans: number }> {
  const now = new Date();

  const strikes = await prisma.strike.updateMany({
    where: { status: 'active', expiresAt: { lte: now } },
    data: { status: 'expired' },
  });

  const bans = await prisma.user.updateMany({
    where: { status: 'temp_banned', banUntil: { lte: now } },
    data: { status: 'active', banUntil: null, banReason: null },
  });

  return { strikes: strikes.count, bans: bans.count };
}

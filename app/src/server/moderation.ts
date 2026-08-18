import 'server-only';

import { prisma } from '@polyforge/db';

import { getSettings } from './settings';

/**
 * Страйки и баны (§3).
 *
 * Пороги живут в настройках платформы: «три страйка — неделя бана» это
 * политика, а не свойство кода, и админ должен уметь её поменять без деплоя.
 */

export interface StrikeOutcome {
  activeStrikes: number;
  banned: boolean;
  bannedUntil: Date | null;
}

/**
 * Выдаёт страйк и, если порог достигнут, временно банит.
 *
 * Перманентный бан остаётся ручным решением суперадмина: автоматика доводит
 * только до временного, дальше нужен человек.
 */
export async function issueStrike(input: {
  userId: string;
  reason: string;
  note?: string;
  reportId?: string;
  issuedById?: string;
}): Promise<StrikeOutcome> {
  const { strike_expiry_days, strikes_to_temp_ban, temp_ban_days } = await getSettings([
    'strike_expiry_days',
    'strikes_to_temp_ban',
    'temp_ban_days',
  ]);

  await prisma.strike.create({
    data: {
      userId: input.userId,
      reason: input.reason.slice(0, 120),
      note: input.note?.slice(0, 2000) || null,
      reportId: input.reportId ?? null,
      issuedById: input.issuedById ?? null,
      expiresAt: new Date(Date.now() + strike_expiry_days * 86_400_000),
    },
  });

  const activeStrikes = await countActiveStrikes(input.userId);

  if (activeStrikes < strikes_to_temp_ban) {
    return { activeStrikes, banned: false, bannedUntil: null };
  }

  const bannedUntil = new Date(Date.now() + temp_ban_days * 86_400_000);

  await prisma.user.update({
    where: { id: input.userId },
    data: { status: 'temp_banned', banUntil: bannedUntil, banReason: input.reason.slice(0, 200) },
  });

  // Активные сессии не должны пережить бан.
  await prisma.refreshSession.updateMany({
    where: { userId: input.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return { activeStrikes, banned: true, bannedUntil };
}

/** Страйк считается активным, пока не истёк и не отозван. */
export async function countActiveStrikes(userId: string): Promise<number> {
  return prisma.strike.count({
    where: { userId, status: 'active', expiresAt: { gt: new Date() } },
  });
}

export async function listStrikes(userId: string) {
  return prisma.strike.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reason: true,
      note: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      issuedBy: { select: { nickname: true } },
    },
  });
}

/**
 * Снятие истёкших страйков и временных банов — крон воркера.
 * Возвращает, сколько записей тронуто, чтобы прогон было видно в логе.
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

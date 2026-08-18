import 'server-only';

import { prisma } from '@polyforge/db';

import { getSettings } from '../settings';

/**
 * ИИ-кредиты (§3, AICreditLedger).
 *
 * Баланс не хранится отдельным полем, а считается по журналу списаний за
 * текущий месяц: журнал всё равно нужен пользователю («на что ушли кредиты»),
 * а два источника правды рано или поздно разъедутся.
 *
 * Два пула, как в настройке `ai_credits_monthly`: отдельный на генерацию ТЗ
 * (дорогая фича, которую нельзя вычерпать переводами) и общий на остальное.
 */

export type AIFeature =
  | 'brief_generate'
  | 'brief_review'
  | 'brief_clarify'
  | 'match_designers'
  | 'estimate'
  | 'field_hint'
  | 'improve_text'
  | 'translate_msg'
  | 'chat_summary'
  | 'dispute_summary'
  | 'onboarding_parse'
  | 'content_translate';

type CreditPool = 'brief_generate' | 'general_pool';

/** Генерация ТЗ тратит свой пул, всё остальное — общий. */
function poolFor(feature: AIFeature): CreditPool {
  return feature === 'brief_generate' ? 'brief_generate' : 'general_pool';
}

/** Период учёта — календарный месяц в UTC. */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface CreditBalance {
  pool: CreditPool;
  limit: number;
  spent: number;
  left: number;
}

export async function getBalances(userId: string): Promise<CreditBalance[]> {
  const period = currentPeriod();
  const { ai_credits_monthly } = await getSettings(['ai_credits_monthly']);

  const spentRows = await prisma.aICreditLedger.groupBy({
    by: ['pool'],
    where: { userId, period },
    _sum: { cost: true },
  });

  const spentByPool = new Map(spentRows.map((row) => [row.pool, row._sum.cost ?? 0]));

  return (['brief_generate', 'general_pool'] as const).map((pool) => {
    const limit = ai_credits_monthly[pool];
    const spent = spentByPool.get(pool) ?? 0;
    return { pool, limit, spent, left: Math.max(0, limit - spent) };
  });
}

export type SpendResult =
  | { ok: true; cost: number; left: number }
  | { ok: false; error: 'errors.ai.noCredits'; left: number };

/**
 * Списывает кредиты под фичу. Стоимость и лимиты — настройки платформы,
 * поэтому админ меняет их без деплоя (§1.2.6).
 *
 * Списание идёт ДО вызова модели: при ошибке вызывающий код возвращает
 * кредиты через `refund`. Обратный порядок означал бы, что упавший, но
 * оплаченный провайдером запрос ничего не стоит пользователю.
 */
export async function spendCredits(
  userId: string,
  feature: AIFeature,
  target?: { type: string; id: string },
): Promise<SpendResult> {
  const period = currentPeriod();
  const pool = poolFor(feature);

  const { ai_feature_costs, ai_credits_monthly } = await getSettings([
    'ai_feature_costs',
    'ai_credits_monthly',
  ]);

  const cost = ai_feature_costs[feature] ?? 1;
  const limit = ai_credits_monthly[pool];

  const spent = await prisma.aICreditLedger.aggregate({
    where: { userId, period, pool },
    _sum: { cost: true },
  });

  const alreadySpent = spent._sum.cost ?? 0;

  // Бесплатные фичи (в бете это перевод) журналируем, но лимитом не режем.
  if (cost > 0 && alreadySpent + cost > limit) {
    return { ok: false, error: 'errors.ai.noCredits', left: Math.max(0, limit - alreadySpent) };
  }

  await prisma.aICreditLedger.create({
    data: {
      userId,
      feature,
      cost,
      pool,
      period,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
    },
  });

  return { ok: true, cost, left: Math.max(0, limit - alreadySpent - cost) };
}

/** Возврат при ошибке провайдера: компенсирующая запись, а не удаление. */
export async function refundCredits(
  userId: string,
  feature: AIFeature,
  cost: number,
  target?: { type: string; id: string },
): Promise<void> {
  if (cost <= 0) return;

  await prisma.aICreditLedger
    .create({
      data: {
        userId,
        feature,
        cost: -cost,
        pool: poolFor(feature),
        period: currentPeriod(),
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
      },
    })
    .catch((error: unknown) => {
      console.error('[ai] не удалось вернуть кредиты', error);
    });
}

/** Последние списания для страницы «мои кредиты». */
export async function listCreditHistory(userId: string, limit = 30) {
  return prisma.aICreditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, feature: true, cost: true, pool: true, createdAt: true },
  });
}

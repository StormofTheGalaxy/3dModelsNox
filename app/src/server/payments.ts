import 'server-only';

import { prisma } from '@polyforge/db';
import { commissionFor, createPaymentProvider, type PaymentProvider } from '@polyforge/payments';

import { getSetting } from './settings';

/**
 * Платёжный модуль и комиссии (§1.2.2, post-MVP №11).
 *
 * Оба флага выключены и останутся выключенными до появления юрлица —
 * так записано и в §1.2.1, и в самом списке post-MVP («при появлении
 * юрлица»). Поэтому здесь нет ни одной строки, которая двигала бы деньги.
 *
 * Что здесь есть: посчитанная комиссия, запись о начислении и провайдер за
 * интерфейсом. Смысл в том, чтобы в день, когда юрлицо появится,
 * подключение шлюза было работой на неделю, а не переписыванием сделки.
 */

let cached: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider {
  // Драйвер один и выбирается не настройкой: настройка, предлагающая
  // выбрать несуществующий шлюз, — это обещание, которое некому сдержать.
  cached ??= createPaymentProvider('manual');
  return cached;
}

export async function paymentsEnabled(): Promise<boolean> {
  return getSetting('feature_payments');
}

export async function commissionsEnabled(): Promise<boolean> {
  return getSetting('feature_commissions');
}

export interface CommissionView {
  enabled: boolean;
  percent: number;
  /** В той же единице, что и сумма этапа: платформа считает в целых. */
  fee: number;
  payout: number;
}

/**
 * Сколько платформа удержала бы с этого этапа.
 *
 * При выключенных комиссиях возвращает нули — и это не заглушка на время,
 * а текущее устройство платформы: комиссии нет, значит и удержания нет.
 */
export async function commissionPreview(
  amount: number,
  designerId: string,
): Promise<CommissionView> {
  const enabled = await commissionsEnabled();

  if (!enabled) {
    return { enabled: false, percent: 0, fee: 0, payout: amount };
  }

  const [tiers, dealsCompleted] = await Promise.all([
    getSetting('commission_tiers'),
    prisma.deal.count({ where: { designerId, status: 'completed' } }),
  ]);

  const result = commissionFor(amount, dealsCompleted, tiers, true);

  return {
    enabled: true,
    percent: result.percent,
    fee: result.feeMinor,
    payout: result.payoutMinor,
  };
}

/**
 * Запись о начислении комиссии при закрытии этапа.
 *
 * Ставка сохраняется вместе с суммой: шкала может измениться, начисление —
 * нет. Пересчитывать чужие прошлые сделки по новой ставке нельзя.
 *
 * При выключенных комиссиях не делает ничего и не создаёт пустых записей:
 * ноль, записанный в таблицу, потом не отличить от настоящего нуля.
 */
export async function recordPlatformFee(input: {
  milestoneId: string;
  designerId: string;
  amount: number;
  currency: string;
}): Promise<void> {
  if (!(await commissionsEnabled())) return;

  const view = await commissionPreview(input.amount, input.designerId);
  if (view.fee <= 0) return;

  await prisma.platformFee.upsert({
    where: { milestoneId: input.milestoneId },
    create: {
      milestoneId: input.milestoneId,
      userId: input.designerId,
      percent: view.percent,
      amountMinor: view.fee,
      currency: input.currency,
    },
    // Этап закрывается один раз, но повторный вызов не должен ломаться:
    // начисление уже есть, и переписывать его новой ставкой нельзя.
    update: {},
  });
}

/** Сводка по начислениям — для админки. */
export async function feeTotals(): Promise<{ currency: string; total: number; count: number }[]> {
  const rows = await prisma.platformFee.groupBy({
    by: ['currency'],
    _sum: { amountMinor: true },
    _count: { _all: true },
  });

  return rows.map((row) => ({
    currency: row.currency,
    total: row._sum.amountMinor ?? 0,
    count: row._count._all,
  }));
}

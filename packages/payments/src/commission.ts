/**
 * Комиссия платформы (§1.2.2, post-MVP №11).
 *
 * ТЗ задаёт шкалу прямо: 15/10/5 % по количеству заказов. Смысл шкалы —
 * поощрять тех, кто остаётся: чем больше закрытых сделок, тем меньше
 * платформа берёт.
 *
 * Сами проценты и пороги живут в реестре настроек, а не здесь: §1.2.6
 * запрещает зашивать пороги в код, и ставка комиссии — последнее, что
 * стоит менять деплоем.
 */

export interface CommissionTier {
  /** С какого числа завершённых сделок действует ставка. */
  fromDeals: number;
  /** Ставка в процентах. */
  percent: number;
}

export interface CommissionResult {
  /** Ставка, которая применилась. */
  percent: number;
  /** Сумма комиссии в минимальных единицах валюты. */
  feeMinor: number;
  /** Сколько остаётся исполнителю. */
  payoutMinor: number;
}

/**
 * Комиссия за один этап.
 *
 * Округление вниз и в пользу исполнителя: половина копейки, отданная
 * платформе, не стоит вопроса «почему пришло на копейку меньше».
 */
export function commissionFor(
  amountMinor: number,
  dealsCompleted: number,
  tiers: CommissionTier[],
  enabled: boolean,
): CommissionResult {
  if (!enabled || amountMinor <= 0) {
    return { percent: 0, feeMinor: 0, payoutMinor: Math.max(0, amountMinor) };
  }

  // Действует самая выгодная из подходящих ставок: пороги могут быть
  // заданы в любом порядке, и полагаться на сортировку в настройке нельзя.
  const applicable = tiers.filter((tier) => dealsCompleted >= tier.fromDeals);
  const percent =
    applicable.length > 0
      ? Math.min(...applicable.map((tier) => tier.percent))
      : Math.max(...tiers.map((tier) => tier.percent), 0);

  const feeMinor = Math.floor((amountMinor * percent) / 100);

  return { percent, feeMinor, payoutMinor: amountMinor - feeMinor };
}

'use client';

/**
 * Подстановки для системных сообщений ленты.
 *
 * Payload хранится в БД сырыми значениями (вердикт — ключ перечисления),
 * а читателю нужен текст на его языке. Перевод делается на клиенте, а не
 * при записи: язык читателя и язык автора события не совпадают.
 */
export function systemMessageValues(
  payload: Record<string, string | number>,
  translateVerdict: (verdict: string) => string,
): Record<string, string | number> {
  if (typeof payload.verdict !== 'string') return payload;

  return { ...payload, verdict: translateVerdict(payload.verdict) };
}

import type { z } from 'zod';

/**
 * Разбор FormData. Формы отправляют массивы как JSON-строку в скрытом поле:
 * повторяющиеся ключи `formData.getAll()` теряют порядок при частичной очистке,
 * а порядок тегов и медиа значим.
 */

/** Первая ошибка каждого поля в виде ключей i18n. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !(field in result)) {
      result[field] = issue.message;
    }
  }

  return result;
}

export function jsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || value.trim() === '') return [];

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/** Свободный список: JSON-массив либо строка через запятую. */
export function stringListField(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];

  if (value.trim().startsWith('[')) {
    const parsed = jsonField(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Пустое поле числа — это `null`, а не 0: «не указано» и «ноль» разные вещи. */
export function numberField(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

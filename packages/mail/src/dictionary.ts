
import en from '@polyforge/shared/messages/en.json';
import ru from '@polyforge/shared/messages/ru.json';
import type { Locale } from '@polyforge/shared';

/**
 * Письма собираются вне контекста запроса (в том числе в воркере), поэтому
 * next-intl здесь недоступен — читаем те же словари напрямую.
 */
const DICTIONARIES = { ru, en } as const;

type Dictionary = typeof ru;

export type EmailTranslator = (key: string, values?: Record<string, string | number>) => string;

function lookup(dictionary: Dictionary, path: string): string | undefined {
  const segments = path.split('.');
  let current: unknown = dictionary;

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

/** Мини-переводчик для писем: поиск по точечному пути + подстановка {vars}. */
export function getEmailTranslator(locale: Locale): EmailTranslator {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES.ru;

  return (key, values) => {
    const template = lookup(dictionary, key) ?? lookup(DICTIONARIES.ru, key) ?? key;
    if (!values) return template;

    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}

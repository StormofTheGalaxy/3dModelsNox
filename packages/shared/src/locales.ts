/**
 * Языки интерфейса. Архитектура готова к добавлению новых языков:
 * достаточно добавить код сюда и файл словаря в `messages/`.
 */
export const LOCALES = ['ru', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
};

/** Короткая метка для переключателя в шапке. */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  ru: 'RU',
  en: 'EN',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

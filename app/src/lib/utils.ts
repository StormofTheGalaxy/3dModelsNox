import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Слияние Tailwind-классов: последний конфликтующий побеждает. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Дата в формате локали пользователя, без времени. */
export function formatDate(date: Date | string, locale: string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

import { defineRouting } from 'next-intl/routing';

import { DEFAULT_LOCALE, LOCALES } from '@polyforge/shared';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Префикс в URL всегда: /ru/... и /en/... — §2.1 ТЗ.
  localePrefix: 'always',
  localeDetection: true,
});

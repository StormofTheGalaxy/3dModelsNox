import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

/**
 * Словари живут в `@polyforge/shared/messages` — их читают и app, и worker
 * (двуязычные письма), поэтому они лежат в общем пакете, а не внутри app.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const messages = (await import(`@polyforge/shared/messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };

  return {
    locale,
    messages: messages.default,
    timeZone: 'UTC',
    now: new Date(),
  };
});

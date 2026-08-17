'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useLocale } from 'next-intl';
import { useState } from 'react';

/**
 * Капча Cloudflare Turnstile (§2.1). Токен кладём в собственное скрытое поле
 * `turnstileToken`, а не полагаемся на поле, которое виджет вставляет сам, —
 * так server action читает его одинаково во всех формах.
 *
 * Без настроенного site key виджет не рендерится, а в поле уходит заглушка:
 * серверная проверка в этом режиме тоже отключена (локальная разработка).
 */
export function TurnstileField({ siteKey }: { siteKey: string }) {
  const locale = useLocale();
  const [token, setToken] = useState('');

  if (!siteKey) {
    return <input type="hidden" name="turnstileToken" value="dev" readOnly />;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input type="hidden" name="turnstileToken" value={token} readOnly />
      <Turnstile
        siteKey={siteKey}
        options={{ theme: 'auto', language: locale, responseField: false }}
        onSuccess={setToken}
        onExpire={() => setToken('')}
        onError={() => setToken('')}
      />
    </div>
  );
}

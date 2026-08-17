import 'server-only';

import { createMailer, type ActionEmailContent, type Mailer } from '@polyforge/mail';
import type { Locale } from '@polyforge/shared';

import { env, publicEnv } from '../env';

/**
 * Почта приложения. Сборка письма живёт в `@polyforge/mail` — тот же пакет
 * использует воркер для дайджестов по сохранённым фильтрам (§4.5, §4.7).
 */

let cached: Mailer | null = null;

function mailer(): Mailer {
  cached ??= createMailer({
    transport: env.EMAIL_TRANSPORT,
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    appUrl: publicEnv.NEXT_PUBLIC_APP_URL,
  });

  return cached;
}

export async function sendVerificationEmail(
  to: string,
  locale: Locale,
  token: string,
): Promise<void> {
  await mailer().sendFromDictionary(
    to,
    locale,
    'emails.verify',
    `/${locale}/verify-email?token=${encodeURIComponent(token)}`,
  );
}

export async function sendPasswordResetEmail(
  to: string,
  locale: Locale,
  token: string,
): Promise<void> {
  await mailer().sendFromDictionary(
    to,
    locale,
    'emails.reset',
    `/${locale}/reset-password?token=${encodeURIComponent(token)}`,
  );
}

export async function sendWelcomeEmail(to: string, locale: Locale): Promise<void> {
  await mailer().sendFromDictionary(to, locale, 'emails.welcome', `/${locale}/dashboard`, {
    withDisclaimer: false,
  });
}

/** Письмо-уведомление: тексты формирует вызывающий код, знающий контекст. */
export async function sendNotificationEmail(
  to: string,
  locale: Locale,
  content: ActionEmailContent,
): Promise<void> {
  await mailer().send(to, locale, content);
}

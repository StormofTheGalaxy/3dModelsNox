import 'server-only';

import { render } from '@react-email/render';
import { Resend } from 'resend';

import type { Locale } from '@polyforge/shared';

import { absoluteUrl, env } from '../env';
import { getEmailTranslator } from './dictionary';
import { ActionEmail } from './templates/action-email';

/**
 * Отправка писем (§2.1). Транспорт выбирается настройкой EMAIL_TRANSPORT:
 * `console` — локальная разработка (ссылка печатается в лог, почта не нужна),
 * `resend`  — прод.
 */

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  resendClient ??= new Resend(env.RESEND_API_KEY);
  return resendClient;
}

interface SendMailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendMail({ to, subject, html, text }: SendMailArgs): Promise<void> {
  if (env.EMAIL_TRANSPORT === 'console') {
    console.info(`\n─── email → ${to} ─────────────────────────────\n${subject}\n\n${text}\n`);
    return;
  }

  const resend = getResend();
  if (!resend) {
    console.warn('[mail] EMAIL_TRANSPORT=resend, но RESEND_API_KEY не задан — письмо не отправлено');
    return;
  }

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend: ${error.message}`);
  }
}

interface ActionMailArgs {
  to: string;
  locale: Locale;
  /** Префикс ключей в словаре: `emails.verify`, `emails.reset`… */
  namespace: 'emails.verify' | 'emails.reset' | 'emails.welcome';
  url: string;
  withDisclaimer?: boolean;
}

async function sendActionMail({
  to,
  locale,
  namespace,
  url,
  withDisclaimer = true,
}: ActionMailArgs): Promise<void> {
  const t = getEmailTranslator(locale);

  const subject = t(`${namespace}.subject`);
  const element = ActionEmail({
    locale,
    preview: subject,
    heading: t(`${namespace}.heading`),
    body: t(`${namespace}.body`),
    actionLabel: t(`${namespace}.action`),
    actionUrl: url,
    disclaimer: withDisclaimer ? t(`${namespace}.ignore`) : undefined,
    footer: t('emails.footer'),
  });

  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  await sendMail({ to, subject, html, text });
}

export async function sendVerificationEmail(
  to: string,
  locale: Locale,
  token: string,
): Promise<void> {
  await sendActionMail({
    to,
    locale,
    namespace: 'emails.verify',
    url: absoluteUrl(`/${locale}/verify-email?token=${encodeURIComponent(token)}`),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  locale: Locale,
  token: string,
): Promise<void> {
  await sendActionMail({
    to,
    locale,
    namespace: 'emails.reset',
    url: absoluteUrl(`/${locale}/reset-password?token=${encodeURIComponent(token)}`),
  });
}

export async function sendWelcomeEmail(to: string, locale: Locale): Promise<void> {
  await sendActionMail({
    to,
    locale,
    namespace: 'emails.welcome',
    url: absoluteUrl(`/${locale}/dashboard`),
    withDisclaimer: false,
  });
}

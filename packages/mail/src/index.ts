import { render } from '@react-email/render';
import { Resend } from 'resend';

import type { Locale } from '@polyforge/shared';

import { ActionEmail } from './action-email';
import { getEmailTranslator } from './dictionary';

export { ActionEmail } from './action-email';
export { getEmailTranslator, type EmailTranslator } from './dictionary';

/**
 * Отправка писем (§2.1).
 *
 * Пакет общий для app и worker: приложение шлёт транзакционные письма
 * в ответ на действие пользователя, воркер — дайджесты по сохранённым
 * фильтрам и напоминания.
 */

export interface MailerConfig {
  /** `console` печатает письмо в лог — режим локальной разработки. */
  transport: 'console' | 'resend';
  apiKey: string;
  from: string;
  /** База для абсолютных ссылок в письмах. */
  appUrl: string;
}

export interface ActionEmailContent {
  subject: string;
  heading: string;
  body: string;
  actionLabel: string;
  /** Путь внутри приложения либо готовый абсолютный URL. */
  actionUrl: string;
  disclaimer?: string;
}

export interface Mailer {
  send(to: string, locale: Locale, content: ActionEmailContent): Promise<void>;
  /** Письмо по ключам словаря: `emails.verify`, `emails.reset`, `emails.welcome`. */
  sendFromDictionary(
    to: string,
    locale: Locale,
    namespace: string,
    path: string,
    options?: { withDisclaimer?: boolean },
  ): Promise<void>;
}

export function createMailer(config: MailerConfig): Mailer {
  let resend: Resend | null = null;

  function client(): Resend | null {
    if (!config.apiKey) return null;
    resend ??= new Resend(config.apiKey);
    return resend;
  }

  function absolute(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${config.appUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async function deliver(to: string, subject: string, html: string, text: string): Promise<void> {
    if (config.transport === 'console') {
      console.info(`\n─── email → ${to} ─────────────────────────────\n${subject}\n\n${text}\n`);
      return;
    }

    const api = client();
    if (!api) {
      console.warn('[mail] transport=resend, но ключ не задан — письмо не отправлено');
      return;
    }

    const { error } = await api.emails.send({ from: config.from, to, subject, html, text });
    if (error) throw new Error(`Resend: ${error.message}`);
  }

  async function send(to: string, locale: Locale, content: ActionEmailContent): Promise<void> {
    const t = getEmailTranslator(locale);

    const element = ActionEmail({
      locale,
      preview: content.subject,
      heading: content.heading,
      body: content.body,
      actionLabel: content.actionLabel,
      actionUrl: absolute(content.actionUrl),
      disclaimer: content.disclaimer,
      footer: t('emails.footer'),
    });

    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    await deliver(to, content.subject, html, text);
  }

  return {
    send,

    async sendFromDictionary(to, locale, namespace, path, options) {
      const t = getEmailTranslator(locale);

      await send(to, locale, {
        subject: t(`${namespace}.subject`),
        heading: t(`${namespace}.heading`),
        body: t(`${namespace}.body`),
        actionLabel: t(`${namespace}.action`),
        actionUrl: path,
        disclaimer: options?.withDisclaimer === false ? undefined : t(`${namespace}.ignore`),
      });
    },
  };
}

import type { CSSProperties } from 'react';

import type { Locale } from '@polyforge/shared';

/**
 * Единый шаблон транзакционного письма: заголовок, текст, одна кнопка.
 * Подтверждение email и сброс пароля отличаются только контентом, поэтому
 * держим один компонент вместо трёх почти одинаковых.
 *
 * Разметка — обычные элементы с инлайновыми стилями (почтовые клиенты не
 * понимают внешний CSS). Пакет `@react-email/components` не используется:
 * он помечен в npm как устаревший, а рендер берём из `@react-email/render`.
 */

export interface ActionEmailProps {
  locale: Locale;
  preview: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  /** Мелкий текст под кнопкой — «если это были не вы». */
  disclaimer?: string;
  footer: string;
}

const colors = {
  bg: '#0b0d12',
  surface: '#12151d',
  border: '#262b38',
  text: '#e8eaf0',
  muted: '#9aa1b2',
  accent: '#7c5cff',
};

const styles = {
  body: {
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: 'Inter, Arial, Helvetica, sans-serif',
    margin: 0,
    padding: '32px 12px',
  },
  card: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    margin: '0 auto',
    maxWidth: '520px',
    padding: '32px',
  },
  brand: {
    color: colors.accent,
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    margin: '0 0 24px',
    textTransform: 'uppercase',
  },
  heading: {
    color: colors.text,
    fontSize: '24px',
    lineHeight: 1.3,
    margin: '0 0 12px',
  },
  text: {
    color: colors.muted,
    fontSize: '15px',
    lineHeight: 1.6,
    margin: '0 0 28px',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: '12px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '15px',
    fontWeight: 600,
    padding: '14px 28px',
    textDecoration: 'none',
  },
  fallbackUrl: {
    color: colors.muted,
    fontSize: '12px',
    lineHeight: 1.6,
    margin: '24px 0 0',
    wordBreak: 'break-all',
  },
  small: {
    color: colors.muted,
    fontSize: '13px',
    lineHeight: 1.6,
    margin: '16px 0 0',
  },
  divider: {
    border: 'none',
    borderTop: `1px solid ${colors.border}`,
    margin: '28px 0 16px',
  },
  footer: {
    color: colors.muted,
    fontSize: '12px',
    lineHeight: 1.5,
    margin: 0,
  },
  // Текст превью в списке писем: виден клиенту, но не на самой странице.
  preview: {
    display: 'none',
    maxHeight: 0,
    overflow: 'hidden',
    opacity: 0,
  },
} satisfies Record<string, CSSProperties>;

export function ActionEmail({
  locale,
  preview,
  heading,
  body,
  actionLabel,
  actionUrl,
  disclaimer,
  footer,
}: ActionEmailProps) {
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark light" />
        <title>{preview}</title>
      </head>
      <body style={styles.body}>
        <div style={styles.preview}>{preview}</div>

        <div style={styles.card}>
          <p style={styles.brand}>PolyForge</p>

          <h1 style={styles.heading}>{heading}</h1>
          <p style={styles.text}>{body}</p>

          <a href={actionUrl} style={styles.button}>
            {actionLabel}
          </a>

          {/* Часть клиентов режет кнопки — дублируем ссылку текстом. */}
          <p style={styles.fallbackUrl}>{actionUrl}</p>

          {disclaimer ? <p style={styles.small}>{disclaimer}</p> : null}

          <hr style={styles.divider} />

          <p style={styles.footer}>{footer}</p>
        </div>
      </body>
    </html>
  );
}

export default ActionEmail;

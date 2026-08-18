import { Fragment } from 'react';

/**
 * Минимальный рендер markdown для правовых документов (§4.10).
 *
 * Своя реализация вместо библиотеки: нужны заголовки, абзацы, списки и
 * жирный шрифт — ровно то, из чего состоит оферта. Любой markdown-пакет
 * умеет на порядок больше, включая вставку сырого HTML, а это страница,
 * текст которой правится из админки и читается всеми.
 *
 * HTML не интерпретируется в принципе: всё, что не разметка, попадает в
 * текстовый узел React и экранируется.
 */

function renderInline(text: string, keyPrefix: string) {
  // Жирный `**текст**` и ссылки `[подпись](url)`. Остальное — обычный текст.
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = link[2] ?? '';
      // Только http(s) и внутренние пути: `javascript:` в оферте не нужен.
      const safe = /^https?:\/\//.test(href) || href.startsWith('/');
      return safe ? (
        <a key={key} href={href} className="text-accent hover:underline">
          {link[1]}
        </a>
      ) : (
        <Fragment key={key}>{link[1]}</Fragment>
      );
    }

    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function LegalMarkdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);

  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        const key = `block-${index}`;

        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={key} className="text-xl font-semibold">
              {renderInline(trimmed.slice(3), key)}
            </h2>
          );
        }

        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={key} className="text-2xl font-bold">
              {renderInline(trimmed.slice(2), key)}
            </h2>
          );
        }

        const lines = trimmed.split('\n');

        if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
          return (
            <ul key={key} className="flex list-disc flex-col gap-2 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={`${key}-${lineIndex}`} className="text-sm leading-relaxed text-fg-muted">
                  {renderInline(line.trim().replace(/^[-*]\s+/, ''), `${key}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={key} className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
            {renderInline(trimmed, key)}
          </p>
        );
      })}
    </div>
  );
}

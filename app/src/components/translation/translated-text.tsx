'use client';

import { Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Текст, показанный в машинном переводе (§4.7).
 *
 * Пометка и переключатель обязательны: читатель должен понимать, что
 * формулировка не авторская, и уметь посмотреть, что было написано на самом
 * деле — особенно когда речь о цене и сроках.
 */
export function TranslatedText({
  text,
  original,
  translated,
  className,
  as = 'p',
}: {
  text: string;
  original: string;
  translated: boolean;
  className?: string;
  as?: 'p' | 'h1' | 'span';
}) {
  const t = useTranslations('translation');
  const [showOriginal, setShowOriginal] = useState(false);

  const Tag = as;
  const shown = showOriginal ? original : text;

  if (!translated) {
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <span className="flex flex-col gap-1">
      <Tag className={className}>{shown}</Tag>

      <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <span className={cn('flex items-center gap-1', showOriginal && 'opacity-50')}>
          <Languages aria-hidden className="size-3" />
          {t('machineTranslated')}
        </span>

        <button
          type="button"
          className="underline underline-offset-2 hover:text-fg"
          onClick={() => setShowOriginal((current) => !current)}
        >
          {showOriginal ? t('showTranslation') : t('showOriginal')}
        </button>
      </span>
    </span>
  );
}

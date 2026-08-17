'use client';

import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Выбор аватара или обложки. Файл уходит вместе с формой профиля обычным
 * `<input type="file">` — отдельная загрузка ради одной картинки избыточна.
 */
export function ImagePicker({
  name,
  label,
  hint,
  currentUrl,
  aspect = 'square',
}: {
  name: string;
  label: string;
  hint?: string;
  currentUrl?: string | null;
  aspect?: 'square' | 'cover';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [touched, setTouched] = useState(false);

  function pick(file: File | undefined) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setTouched(true);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = '';
    setPreview(touched ? (currentUrl ?? null) : null);
    setTouched(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-fg">{label}</span>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'relative flex shrink-0 items-center justify-center overflow-hidden',
            'border border-dashed border-[var(--pf-border)] bg-surface-2',
            'transition-colors hover:border-accent/60',
            aspect === 'square'
              ? 'size-20 rounded-full'
              : 'h-20 w-40 rounded-[var(--radius-control)]',
          )}
        >
          {preview ? (
            // Превью — blob или уже загруженный файл; next/image здесь только мешает.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5 text-fg-muted" aria-hidden />
          )}
        </button>

        <div className="flex flex-col gap-1">
          {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
          {touched ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex w-fit items-center gap-1 text-xs text-fg-muted hover:text-fg"
            >
              <X className="size-3" aria-hidden />
              {label}
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={(event) => pick(event.target.files?.[0])}
        className="hidden"
      />
    </div>
  );
}

'use client';

import { Plus, X } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';

/**
 * Свободный список тегов с подсказками (софт, движки, форматы).
 *
 * Пресеты не ограничивают ввод: дизайнер работает в чём угодно, и закрытый
 * список означал бы «моего софта тут нет» — плохой первый опыт.
 */
export function TagInput({
  name,
  presets = [],
  defaultValue = [],
  max = 15,
  placeholder,
  onChange,
}: {
  name: string;
  presets?: readonly string[];
  defaultValue?: readonly string[];
  max?: number;
  placeholder?: string;
  /** Уведомление о списке — для форм, чьё состояние живёт снаружи. */
  onChange?: (values: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>([...defaultValue]);
  const [draft, setDraft] = useState('');

  const suggestions = useMemo(
    () => presets.filter((preset) => !tags.includes(preset)).slice(0, 8),
    [presets, tags],
  );

  function add(value: string) {
    const trimmed = value.trim();
    if (!trimmed || tags.length >= max) return;
    // Сравнение без регистра: «blender» и «Blender» — один и тот же софт.
    if (tags.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())) return;

    setTags((current) => {
      const next = [...current, trimmed];
      onChange?.(next);
      return next;
    });
    setDraft('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
      return;
    }
    if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      setTags((current) => {
        const next = current.slice(0, -1);
        onChange?.(next);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={JSON.stringify(tags)} readOnly />

      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)]',
          'border border-[var(--pf-border)] bg-surface-2 px-2 py-1.5',
          'focus-within:border-accent',
        )}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent"
          >
            {tag}
            <button
              type="button"
              onClick={() =>
                setTags((current) => {
                  const next = current.filter((item) => item !== tag);
                  onChange?.(next);
                  return next;
                })
              }
              className="transition-opacity hover:opacity-70"
              aria-label={`${tag} ✕`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}

        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => add(draft)}
          placeholder={tags.length === 0 ? placeholder : undefined}
          disabled={tags.length >= max}
          className="min-w-32 flex-1 bg-transparent px-1.5 py-1 text-sm text-fg outline-none placeholder:text-fg-muted/70"
        />
      </div>

      {suggestions.length > 0 && tags.length < max ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => add(preset)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--pf-border)]',
                'px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent/50 hover:text-fg',
              )}
            >
              <Plus className="size-3" aria-hidden />
              {preset}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

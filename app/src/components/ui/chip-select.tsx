'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Выбор из фиксированного списка чипсами (специализации, стили, языки).
 *
 * Значение уходит в форму скрытым JSON-полем: массивы одноимённых чекбоксов
 * теряют порядок и хуже читаются на сервере.
 */
export function ChipSelect<T extends string>({
  name,
  options,
  labels,
  defaultValue = [],
  max,
  single = false,
  invalid,
  onChange,
}: {
  name: string;
  options: readonly T[];
  /** Готовые подписи: компонент не знает про i18n. */
  labels: Record<string, string>;
  defaultValue?: readonly T[];
  max?: number;
  /** Режим одиночного выбора — для фильтров. */
  single?: boolean;
  invalid?: boolean;
  /**
   * Уведомление о выборе. Нужно, когда состояние формы живёт снаружи
   * (конструктор ТЗ); обычным формам хватает скрытого поля.
   */
  onChange?: (values: T[]) => void;
}) {
  const [selected, setSelected] = useState<T[]>([...defaultValue]);

  function toggle(option: T) {
    setSelected((current) => {
      const next = single
        ? current[0] === option
          ? []
          : [option]
        : current.includes(option)
          ? current.filter((item) => item !== option)
          : max !== undefined && current.length >= max
            ? current
            : [...current, option];

      if (next !== current) onChange?.(next);
      return next;
    });
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(selected)} readOnly />

      <div
        role="group"
        className={cn(
          'flex flex-wrap gap-2',
          // aria-invalid к role="group" неприменим, поэтому ошибку показываем
          // рамкой вокруг набора; текст ошибки рендерит вызывающая форма.
          invalid && 'rounded-[var(--radius-control)] p-2 ring-1 ring-[var(--pf-danger)]',
        )}
      >
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
                'transition-all duration-150 ease-[var(--ease-out-quick)]',
                active
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-[var(--pf-border)] text-fg-muted hover:border-accent/50 hover:text-fg',
              )}
            >
              {active ? <Check className="size-3.5" aria-hidden /> : null}
              {labels[option] ?? option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

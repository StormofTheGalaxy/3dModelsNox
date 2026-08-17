import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Плитка метрики профиля: число крупно, подпись мелко (§4.2). */
export function MetricTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-control)] bg-surface-2 px-4 py-3">
      <span
        className={cn(
          'font-mono text-lg font-bold',
          tone === 'danger' ? 'text-[var(--pf-danger)]' : 'text-fg',
        )}
      >
        {value}
      </span>
      <span className="text-xs text-fg-muted">{label}</span>
    </div>
  );
}

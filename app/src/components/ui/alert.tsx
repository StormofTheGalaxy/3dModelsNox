import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const TONE = {
  info: { icon: Info, color: 'var(--pf-accent)' },
  success: { icon: CheckCircle2, color: 'var(--pf-success)' },
  warning: { icon: AlertTriangle, color: 'var(--pf-warning)' },
  danger: { icon: XCircle, color: 'var(--pf-danger)' },
} as const;

export type AlertTone = keyof typeof TONE;

/** Инлайновое сообщение формы: ошибка входа, «письмо отправлено» и т. п. */
export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, color } = TONE[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3.5 py-3 text-sm',
        className,
      )}
      style={{
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        color,
      }}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-fg">{children}</div>
    </div>
  );
}

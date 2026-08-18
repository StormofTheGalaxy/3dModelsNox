'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { updateSetting } from '@/server/actions/admin';
import { idleState, type ActionState } from '@/server/actions/types';

/**
 * Редактор одной настройки (§4.10).
 *
 * Значение правится как JSON: типы в реестре разные — числа, массивы,
 * объекты правил уровней, — и рисовать под каждый свою форму значило бы
 * держать вторую копию реестра в разметке. Валидация всё равно на сервере
 * по схеме из реестра, так что синтаксическая ошибка не пройдёт.
 */
export function SettingsEditor({
  settingKey,
  label,
  value,
  defaultValue,
}: {
  settingKey: string;
  label: string;
  value: string;
  defaultValue: string;
}) {
  const t = useTranslations('admin.settings');
  const tRoot = useTranslations();

  const [current, setCurrent] = useState(value);

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await updateSetting(previous, formData);

      if (result.status === 'success') {
        toast.success(tRoot(result.message ?? 'settings.saved'));
      } else if (result.message) {
        toast.error(tRoot(result.message, result.values));
      }

      return result;
    },
    idleState,
  );

  const isDefault = current === defaultValue;

  return (
    <Card>
      <CardContent className="p-4">
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="key" value={settingKey} />

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor={`setting-${settingKey}`} className="text-sm font-medium">
              {label}
            </label>
            <code className="font-mono text-xs text-fg-muted">{settingKey}</code>
          </div>

          <Textarea
            id={`setting-${settingKey}`}
            name="value"
            rows={current.length > 80 ? 4 : 1}
            className="font-mono text-sm"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />

          {state.status === 'error' && state.message ? (
            <p className="text-xs text-[var(--pf-danger)]">
              {tRoot(state.message, state.values)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" loading={pending} disabled={current === value}>
              {t('save')}
            </Button>

            {!isDefault ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCurrent(defaultValue)}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                {t('reset')}
              </Button>
            ) : (
              <span className="text-xs text-fg-muted">{t('isDefault')}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

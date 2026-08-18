'use client';

import { Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { createBroadcast } from '@/server/actions/admin';
import { idleState, type ActionState } from '@/server/actions/types';

const SEGMENTS = ['all', 'designers', 'customers', 'waitlist'] as const;

/**
 * Форма рассылки (§4.10).
 *
 * Отправка ставится в очередь и идёт воркером — форма лишь фиксирует, кому
 * и что. Предупреждение о необратимости стоит рядом с кнопкой: отозвать
 * ушедшее письмо невозможно.
 */
export function BroadcastForm() {
  const t = useTranslations('admin.broadcasts');
  const tRoot = useTranslations();
  const router = useRouter();

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await createBroadcast(previous, formData);

      if (result.status === 'success') {
        toast.success(tRoot(result.message ?? 'settings.saved'));
        router.refresh();
      }

      return result;
    },
    idleState,
  );

  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="broadcast-segment">{t('segment')}</Label>
              <Select id="broadcast-segment" name="segment" defaultValue="all">
                {SEGMENTS.map((segment) => (
                  <option key={segment} value={segment}>
                    {t(`segments.${segment}`)}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="broadcast-locale">{t('locale')}</Label>
              <Select id="broadcast-locale" name="locale" defaultValue="">
                <option value="">{t('anyLocale')}</option>
                <option value="ru">RU</option>
                <option value="en">EN</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="broadcast-subject">{t('subject')}</Label>
            <Input id="broadcast-subject" name="subject" maxLength={200} required />
          </div>

          <div>
            <Label htmlFor="broadcast-body">{t('body')}</Label>
            <Textarea id="broadcast-body" name="body" rows={6} required minLength={20} />
          </div>

          <Alert tone="warning">{t('warning')}</Alert>

          {state.status === 'error' && state.message ? (
            <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
          ) : null}

          <Button type="submit" loading={pending} className="sm:w-fit">
            <Megaphone aria-hidden className="size-4" />
            {t('send')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

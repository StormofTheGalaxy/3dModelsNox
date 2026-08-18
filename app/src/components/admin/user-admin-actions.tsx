'use client';

import { Ban, EyeOff, ShieldCheck, Ticket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { DESIGNER_LEVELS } from '@polyforge/shared';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { grantInvites, setDesignerLevel } from '@/server/actions/admin';
import { setUserStatus } from '@/server/actions/moderation';

/**
 * Действия над пользователем (§4.10).
 *
 * Всё, что меняет статус аккаунта или уровень, доступно только суперадмину:
 * модератор разбирает жалобы, но не раздаёт уровни и не банит навсегда.
 */
export function UserAdminActions({
  userId,
  status,
  level,
  isSelf,
  canManage,
}: {
  userId: string;
  status: string;
  level: string | null;
  isSelf: boolean;
  canManage: boolean;
}) {
  const t = useTranslations('admin.users');
  const tRoot = useTranslations();
  const tTax = useTranslations('taxonomy');
  const router = useRouter();

  const [reason, setReason] = useState('');
  const [invites, setInvites] = useState(5);
  const [nextLevel, setNextLevel] = useState(level ?? 'novice');
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-fg-muted">{t('adminOnly')}</CardContent>
      </Card>
    );
  }

  if (isSelf) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-fg-muted">{t('selfNotice')}</CardContent>
      </Card>
    );
  }

  function changeStatus(next: 'active' | 'shadow_banned' | 'banned') {
    startTransition(async () => {
      const result = await setUserStatus(userId, next, reason);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  function applyLevel() {
    startTransition(async () => {
      const result = await setDesignerLevel(userId, nextLevel);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      toast.success(tRoot('settings.saved'));
      router.refresh();
    });
  }

  function addInvites() {
    startTransition(async () => {
      const result = await grantInvites(userId, invites);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      toast.success(tRoot('settings.saved'));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <h2 className="font-bold">{t('actions')}</h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ban-reason">{t('reason')}</Label>
          <Textarea
            id="ban-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            {status !== 'active' ? (
              <Button size="sm" loading={pending} onClick={() => changeStatus('active')}>
                <ShieldCheck aria-hidden className="size-4" />
                {t('unban')}
              </Button>
            ) : null}

            {status !== 'shadow_banned' ? (
              <Button
                size="sm"
                variant="secondary"
                loading={pending}
                onClick={() => changeStatus('shadow_banned')}
              >
                <EyeOff aria-hidden className="size-4" />
                {t('shadowBan')}
              </Button>
            ) : null}

            {status !== 'banned' ? (
              <Button
                size="sm"
                variant="danger"
                loading={pending}
                onClick={() => changeStatus('banned')}
              >
                <Ban aria-hidden className="size-4" />
                {t('ban')}
              </Button>
            ) : null}
          </div>

          <Alert tone="info">{t('shadowBanHint')}</Alert>
        </div>

        {level ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-[var(--pf-border)] pt-4">
            <div className="min-w-40 flex-1">
              <Label htmlFor="user-level">{t('level')}</Label>
              <Select
                id="user-level"
                value={nextLevel}
                onChange={(event) => setNextLevel(event.target.value)}
              >
                {DESIGNER_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {tTax(`level.${value}`)}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" variant="secondary" loading={pending} onClick={applyLevel}>
              {t('applyLevel')}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--pf-border)] pt-4">
          <div className="w-28">
            <Label htmlFor="invite-count">{t('invites')}</Label>
            <Input
              id="invite-count"
              type="number"
              min={1}
              max={100}
              value={invites}
              onChange={(event) => setInvites(Number(event.target.value) || 1)}
            />
          </div>
          <Button size="sm" variant="secondary" loading={pending} onClick={addInvites}>
            <Ticket aria-hidden className="size-4" />
            {t('grantInvites')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

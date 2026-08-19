'use client';

import {
  Building2,
  Check,
  LogOut,
  Plus,
  Shield,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import {
  createOrganization,
  inviteMember,
  removeMember,
  respondToInvite,
  setMemberRole,
} from '@/server/actions/organizations';

/**
 * Кабинет команд и студий (§1.4, post-MVP №7).
 *
 * Организация — способ вести общие ТЗ и заказы, а не юрлицо: стороной
 * сделки и носителем репутации остаётся человек. Поэтому здесь только
 * состав и роли, без реквизитов и балансов.
 */

export interface TeamMember {
  userId: string;
  nickname: string;
  role: string;
  accepted: boolean;
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  kind: string;
  isOwner: boolean;
  canManage: boolean;
  members: TeamMember[];
}

export interface PendingInvite {
  organizationId: string;
  name: string;
  kind: string;
}

export function TeamsManager({
  teams,
  invites,
  viewerId,
}: {
  teams: Team[];
  invites: PendingInvite[];
  viewerId: string;
}) {
  const t = useTranslations('teams');
  const tRoot = useTranslations();
  const router = useRouter();

  const [name, setName] = useState('');
  const [kind, setKind] = useState('customer_team');
  const [inviteNick, setInviteNick] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function act(action: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      if (done) toast.success(done);
      router.refresh();
    });
  }

  function create() {
    startTransition(async () => {
      const result = await createOrganization(name, kind);

      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }

      setName('');
      toast.success(t('created'));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {invites.length > 0 ? (
        <Card className="border-accent/40">
          <CardHeader>
            <CardTitle>{t('invitesTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {invites.map((invite) => (
              <div
                key={invite.organizationId}
                className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{invite.name}</span>
                  <Badge variant="neutral">{t(`kind.${invite.kind}`)}</Badge>
                </span>

                <span className="flex gap-2">
                  <Button
                    size="sm"
                    loading={pending}
                    onClick={() => act(() => respondToInvite(invite.organizationId, true), t('joined'))}
                  >
                    <Check aria-hidden />
                    {t('accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => act(() => respondToInvite(invite.organizationId, false))}
                  >
                    <X aria-hidden />
                    {t('decline')}
                  </Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {teams.length === 0 ? (
        <Alert tone="info">{t('empty')}</Alert>
      ) : (
        teams.map((team) => (
          <Card key={team.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex min-w-0 items-center gap-2 break-words">
                <Building2 aria-hidden className="size-5 shrink-0 text-fg-muted" />
                {team.kind === 'studio' ? (
                  <Link href={`/studios/${team.slug}`} className="text-accent hover:underline">
                    {team.name}
                  </Link>
                ) : (
                  team.name
                )}
              </CardTitle>

              <Badge variant="neutral">{t(`kind.${team.kind}`)}</Badge>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2">
                {team.members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/designers/${member.nickname}`} className="font-medium hover:text-accent">
                        @{member.nickname}
                      </Link>
                      <Badge variant={member.role === 'owner' ? 'accent' : 'outline'}>
                        {t(`role.${member.role}`)}
                      </Badge>
                      {!member.accepted ? <Badge variant="warning">{t('invited')}</Badge> : null}
                    </span>

                    <span className="flex flex-wrap gap-2">
                      {/* Роли раздаёт только владелец: менеджер, назначающий
                          менеджеров, за пару шагов забирает команду себе. */}
                      {team.isOwner && member.userId !== viewerId && member.accepted ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={pending}
                          onClick={() =>
                            act(
                              () =>
                                setMemberRole(
                                  team.id,
                                  member.userId,
                                  member.role === 'manager' ? 'member' : 'manager',
                                ),
                              t('roleChanged'),
                            )
                          }
                        >
                          <Shield aria-hidden />
                          {member.role === 'manager' ? t('demote') : t('promote')}
                        </Button>
                      ) : null}

                      {member.userId === viewerId && member.role !== 'owner' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={pending}
                          onClick={() => act(() => removeMember(team.id, member.userId), t('left'))}
                        >
                          <LogOut aria-hidden />
                          {t('leave')}
                        </Button>
                      ) : team.canManage && member.role !== 'owner' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={pending}
                          onClick={() => act(() => removeMember(team.id, member.userId), t('removed'))}
                        >
                          <UserMinus aria-hidden />
                          {t('remove')}
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              {team.canManage ? (
                <div className="flex flex-col gap-2 border-t border-[var(--pf-border)] pt-4 sm:flex-row sm:items-end">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor={`invite-${team.id}`}>{t('inviteLabel')}</Label>
                    <Input
                      id={`invite-${team.id}`}
                      placeholder={t('invitePlaceholder')}
                      value={inviteNick[team.id] ?? ''}
                      onChange={(event) =>
                        setInviteNick((current) => ({ ...current, [team.id]: event.target.value }))
                      }
                    />
                  </div>

                  <Button
                    loading={pending}
                    disabled={!(inviteNick[team.id] ?? '').trim()}
                    onClick={() =>
                      act(() => inviteMember(team.id, inviteNick[team.id] ?? ''), t('invitedDone'))
                    }
                  >
                    <UserPlus aria-hidden />
                    {t('invite')}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus aria-hidden className="size-5 text-accent" />
            {t('createTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">{t('createHint')}</p>

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-name">{t('name')}</Label>
              <Input
                id="team-name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-kind">{t('kindLabel')}</Label>
              <Select id="team-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="customer_team">{t('kind.customer_team')}</option>
                <option value="studio">{t('kind.studio')}</option>
              </Select>
            </div>
          </div>

          <Button className="sm:w-fit" loading={pending} onClick={create} disabled={name.trim().length < 2}>
            {t('create')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

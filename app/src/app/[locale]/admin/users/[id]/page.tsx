import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { UserAdminActions } from '@/components/admin/user-admin-actions';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { listStrikes } from '@/server/moderation';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

/** Карточка пользователя (§4.10): профили, сделки, чеки, жалобы, страйки. */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const viewer = await getCurrentUser();

  const [user, strikes, t] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nickname: true,
        email: true,
        role: true,
        status: true,
        locale: true,
        createdAt: true,
        lastSeenAt: true,
        lastIp: true,
        banReason: true,
        banUntil: true,
        invitesLeft: true,
        emailVerifiedAt: true,
        designerProfile: {
          select: { level: true, rating: true, ratingCount: true, ordersCompleted: true, verifiedAt: true },
        },
        customerProfile: { select: { displayName: true, rating: true, ordersCreated: true } },
        _count: {
          select: {
            dealsAsCustomer: true,
            dealsAsDesigner: true,
            orders: true,
            responses: true,
            works: true,
            reportsFiled: true,
          },
        },
      },
    }),
    listStrikes(id),
    getTranslations('admin'),
  ]);

  if (!user) notFound();

  const reportsAgainst = await prisma.report.count({
    where: { targetType: 'user', targetId: user.id },
  });

  const facts = [
    { label: t('users.email'), value: user.email },
    { label: t('users.registered'), value: formatDate(user.createdAt, locale) },
    {
      label: t('users.lastSeen'),
      value: user.lastSeenAt ? formatDate(user.lastSeenAt, locale) : '—',
    },
    // IP показывается для разбора накрутки (§4.8): совпадение адресов
    // у пары «заказчик — дизайнер» и есть основной сигнал.
    { label: t('users.lastIp'), value: user.lastIp ?? '—' },
    { label: t('users.locale'), value: user.locale.toUpperCase() },
    { label: t('users.invitesLeft'), value: String(user.invitesLeft) },
    {
      label: t('users.deals'),
      value: String(user._count.dealsAsCustomer + user._count.dealsAsDesigner),
    },
    { label: t('users.orders'), value: String(user._count.orders) },
    { label: t('users.responses'), value: String(user._count.responses) },
    { label: t('users.works'), value: String(user._count.works) },
    { label: t('users.reportsAgainst'), value: String(reportsAgainst) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{user.nickname}</h1>
          <p className="text-sm text-fg-muted">{user.id}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {user.role !== 'user' ? <Badge variant="accent">{user.role}</Badge> : null}
          <Badge variant={user.status === 'active' ? 'success' : 'danger'}>
            {t(`users.status.${user.status}`)}
          </Badge>
        </div>
      </div>

      {user.banReason ? (
        <Card>
          <CardContent className="p-4 text-sm">
            {t('users.banReason', { reason: user.banReason })}
            {user.banUntil ? ` · ${formatDate(user.banUntil, locale)}` : ''}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-2 p-5 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-3 text-sm">
              <span className="text-fg-muted">{fact.label}</span>
              <span className="text-right break-all">{fact.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {user.designerProfile ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-5">
            <Link href={`/designers/${user.nickname}`} className="font-medium hover:text-accent">
              {t('users.designerProfile')}
            </Link>
            <Badge variant="outline">{user.designerProfile.level}</Badge>
            <span className="text-sm text-fg-muted">
              {user.designerProfile.rating.toFixed(2)} · {user.designerProfile.ordersCompleted}
            </span>
            {user.designerProfile.verifiedAt ? (
              <Badge variant="success">{t('users.verified')}</Badge>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-5">
          <h2 className="mb-3 font-bold">{t('users.strikes')}</h2>
          {strikes.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('users.noStrikes')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {strikes.map((strike) => (
                <li key={strike.id} className="flex flex-wrap justify-between gap-2 text-sm">
                  <span>
                    {strike.reason}
                    {strike.note ? ` — ${strike.note}` : ''}
                  </span>
                  <span className="text-fg-muted">
                    {t(`users.strikeStatus.${strike.status}`)} ·{' '}
                    {formatDate(strike.expiresAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <UserAdminActions
        userId={user.id}
        status={user.status}
        level={user.designerProfile?.level ?? null}
        isSelf={viewer?.id === user.id}
        canManage={viewer?.role === 'admin'}
      />
    </div>
  );
}

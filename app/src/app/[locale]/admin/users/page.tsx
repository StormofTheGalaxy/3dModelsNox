import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma, type Prisma } from '@polyforge/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

const STATUS_TONE = {
  active: 'success',
  shadow_banned: 'warning',
  temp_banned: 'warning',
  banned: 'danger',
  deleted: 'neutral',
} as const;

/** Поиск пользователей (§4.10). */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const search = (query.q ?? '').trim().slice(0, 100);

  const where: Prisma.UserWhereInput = search
    ? {
        OR: [
          { nicknameLower: { contains: search.toLowerCase() } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [users, t] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        nickname: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        emailVerifiedAt: true,
        designerProfile: { select: { level: true, rating: true } },
      },
    }),
    getTranslations('admin'),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.users')}</h1>

      {/* Обычная GET-форма: результат поиска остаётся в адресе и его можно
          переслать коллеге. */}
      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={search}
          placeholder={t('users.searchPlaceholder')}
          aria-label={t('users.searchPlaceholder')}
        />
      </form>

      {users.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('users.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((user) => (
            <li key={user.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {user.nickname}
                    </Link>
                    <p className="truncate text-sm text-fg-muted">{user.email}</p>
                    <p className="text-xs text-fg-muted">{formatDate(user.createdAt, locale)}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {user.role !== 'user' ? (
                      <Badge variant="accent">{user.role}</Badge>
                    ) : null}
                    {user.designerProfile ? (
                      <Badge variant="outline">{user.designerProfile.level}</Badge>
                    ) : null}
                    <Badge variant={STATUS_TONE[user.status]}>
                      {t(`users.status.${user.status}`)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

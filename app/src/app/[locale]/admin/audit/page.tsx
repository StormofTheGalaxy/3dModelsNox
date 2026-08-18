import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma, type Prisma } from '@polyforge/db';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Аудит-лог (§4.10).
 *
 * Только чтение: журнал append-only, и возможность «поправить» запись в
 * админке обесценила бы его как доказательство.
 */
export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ action?: string; actor?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const action = (query.action ?? '').trim().slice(0, 60);
  const actor = (query.actor ?? '').trim().slice(0, 60);

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { contains: action } } : {}),
    ...(actor ? { actor: { nicknameLower: { contains: actor.toLowerCase() } } } : {}),
  };

  const [entries, t] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        payload: true,
        ip: true,
        createdAt: true,
        actor: { select: { nickname: true } },
      },
    }),
    getTranslations('admin'),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.audit')}</h1>

      <form className="flex flex-wrap gap-2">
        <Input
          name="action"
          defaultValue={action}
          placeholder={t('audit.filterAction')}
          aria-label={t('audit.filterAction')}
          className="max-w-56"
        />
        <Input
          name="actor"
          defaultValue={actor}
          placeholder={t('audit.filterActor')}
          aria-label={t('audit.filterActor')}
          className="max-w-56"
        />
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('audit.empty')}</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--pf-border)]">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="font-mono text-xs">{entry.action}</code>
                    <span className="text-xs text-fg-muted">
                      {entry.actor?.nickname ?? t('audit.system')} ·{' '}
                      {formatDate(entry.createdAt, locale)}
                    </span>
                  </div>

                  {entry.targetType ? (
                    <span className="text-xs break-all text-fg-muted">
                      {entry.targetType}:{entry.targetId}
                    </span>
                  ) : null}

                  {entry.payload ? (
                    <code className="font-mono text-xs break-all text-fg-muted">
                      {JSON.stringify(entry.payload).slice(0, 300)}
                    </code>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

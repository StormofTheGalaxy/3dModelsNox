import type { Metadata } from 'next';
import { Ticket } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { InviteRow } from '@/components/invites/invite-row';
import { requireVerifiedUser } from '@/server/auth/guards';
import { publicEnv } from '@/server/env';
import { listUserInvites } from '@/server/invites';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'invites' });
  return { title: t('title') };
}

export default async function InvitesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, invites] = await Promise.all([getTranslations('invites'), listUserInvites(user.id)]);

  const available = invites.filter((invite) => !invite.usedAt).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>
        <Badge variant={available > 0 ? 'accent' : 'neutral'}>
          {t('left', { count: available })}
        </Badge>
      </div>
      <p className="mb-8 text-sm text-fg-muted">{t('subtitle')}</p>

      {invites.length === 0 ? (
        <EmptyState icon={Ticket} title={t('title')} description={t('empty')} />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-[var(--pf-border)] p-0">
            {invites.map((invite) => (
              <InviteRow
                key={invite.id}
                code={invite.code}
                usedByNickname={invite.usedBy?.nickname ?? null}
                inviteUrl={`${publicEnv.NEXT_PUBLIC_APP_URL}/${locale}/i/${invite.code}`}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { TeamsManager } from '@/components/organizations/teams-manager';
import { requireVerifiedUser } from '@/server/auth/guards';
import { organizationsEnabled } from '@/server/organizations';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'teams' });
  return { title: t('title') };
}

/** Кабинет команд и студий (§1.4, post-MVP №7). */
export default async function TeamsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);

  if (!(await organizationsEnabled())) notFound();

  const [t, memberships] = await Promise.all([
    getTranslations('teams'),
    prisma.organizationMember.findMany({
      where: { userId: user.id },
      orderBy: { invitedAt: 'asc' },
      select: {
        role: true,
        acceptedAt: true,
        organization: {
          select: {
            id: true,
            slug: true,
            name: true,
            kind: true,
            ownerId: true,
            members: {
              orderBy: [{ role: 'asc' }, { invitedAt: 'asc' }],
              select: {
                userId: true,
                role: true,
                acceptedAt: true,
                user: { select: { nickname: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const accepted = memberships.filter((membership) => membership.acceptedAt !== null);
  const invites = memberships.filter((membership) => membership.acceptedAt === null);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <p className="mb-8 text-sm text-fg-muted">{t('subtitle')}</p>

      <TeamsManager
        viewerId={user.id}
        invites={invites.map((membership) => ({
          organizationId: membership.organization.id,
          name: membership.organization.name,
          kind: membership.organization.kind,
        }))}
        teams={accepted.map((membership) => ({
          id: membership.organization.id,
          slug: membership.organization.slug,
          name: membership.organization.name,
          kind: membership.organization.kind,
          isOwner: membership.organization.ownerId === user.id,
          canManage: membership.role === 'owner' || membership.role === 'manager',
          members: membership.organization.members.map((member) => ({
            userId: member.userId,
            nickname: member.user.nickname,
            role: member.role,
            accepted: member.acceptedAt !== null,
          })),
        }))}
      />
    </div>
  );
}

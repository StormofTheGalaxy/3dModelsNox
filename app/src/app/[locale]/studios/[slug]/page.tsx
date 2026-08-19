import type { Metadata } from 'next';
import { Building2, Link2, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { WorkCard } from '@/components/works/work-card';
import { Link } from '@/i18n/navigation';
import { getOrganizationBySlug, organizationsEnabled } from '@/server/organizations';
import { listDesignerWorks } from '@/server/works';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const organization = await getOrganizationBySlug(slug);
  if (!organization) return {};

  return {
    title: organization.name,
    description: organization.bio ?? undefined,
  };
}

/**
 * Публичная страница студии (§1.4, post-MVP №7).
 *
 * Показывает состав и общее портфолио: работы остаются за конкретными
 * авторами — репутация на платформе персональная, студия её не собирает.
 */
export default async function StudioPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  if (!(await organizationsEnabled())) notFound();

  const organization = await getOrganizationBySlug(slug);
  // Кабинет заказчика публичной страницы не имеет: там нечего показывать
  // посторонним, кроме списка сотрудников.
  if (!organization || organization.kind !== 'studio') notFound();

  const t = await getTranslations('teams');

  const members = organization.members.filter((member) => member.accepted);

  // Портфолио студии — работы её участников, каждая со своим автором:
  // репутация на платформе персональная, студия её не собирает.
  const works = (
    await Promise.all(members.map((member) => listDesignerWorks(member.userId, false)))
  ).flat();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="size-14 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
            {organization.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={organization.avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="pf-gradient flex size-full items-center justify-center text-xl font-bold text-white">
                {organization.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>

          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-bold break-words sm:text-3xl">{organization.name}</h1>
            <span className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <Badge variant="accent">
                <Building2 className="size-3" aria-hidden />
                {t('kind.studio')}
              </Badge>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {t('membersCount', { count: members.length })}
              </span>
            </span>
          </div>
        </div>

        {organization.bio ? (
          <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
            {organization.bio}
          </p>
        ) : null}

        {organization.website ? (
          <a
            href={organization.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <Link2 className="size-3.5" aria-hidden />
            {organization.website}
          </a>
        ) : null}
      </header>

      <section className="mb-10 flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t('membersTitle')}</h2>

        <ul className="flex flex-wrap gap-2">
          {members.map((member) => (
            <li key={member.userId}>
              <Link
                href={`/designers/${member.nickname}`}
                className="flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--pf-border)] px-3 py-2 text-sm transition-colors hover:border-accent/50"
              >
                <span className="size-7 shrink-0 overflow-hidden rounded-full bg-surface-2">
                  {member.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="pf-gradient flex size-full items-center justify-center text-xs font-bold text-white">
                      {member.nickname.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                @{member.nickname}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">{t('studioWorks')}</h2>

        {works.length === 0 ? (
          <EmptyState icon={Building2} title={t('noWorks')} />
        ) : (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid">
            {works.map((work) => (
              <WorkCard
                key={work.id}
                work={{
                  id: work.id,
                  title: work.title,
                  likesCount: work.likesCount,
                  views: work.views,
                  commentsCount: work.commentsCount,
                  badgeOnPlatform: work.badgeOnPlatform,
                  designer: work.designer,
                  media: work.media,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

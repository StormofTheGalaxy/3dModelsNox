import type { Metadata } from 'next';

import type { Locale } from '@polyforge/shared';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Eye, Link2, Pencil } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ReportDialog } from '@/components/report/report-dialog';
import { WorkComments } from '@/components/works/work-comments';
import { DeleteWorkButton } from '@/components/works/delete-work-button';
import { OrderSimilarButton } from '@/components/works/order-similar-button';
import { LikeButton } from '@/components/works/like-button';
import { TranslatedText } from '@/components/translation/translated-text';
import { getCurrentUser } from '@/server/auth/session';
import { commentsEnabled, listWorkComments } from '@/server/comments';
import { getSettings } from '@/server/settings';
import { translateField } from '@/server/translation';
import { getWorkForViewer, isLikedByViewer, registerWorkView } from '@/server/works';
import { publicEnv } from '@/server/env';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const work = await getWorkForViewer(id, null);
  if (!work) return {};

  const description = work.description?.slice(0, 180) ?? undefined;

  return {
    title: work.title,
    description,
    openGraph: {
      title: work.title,
      description,
      type: 'article',
      // Картинка работы — главный аргумент при шаринге в Discord и Telegram (§2.4).
      images: work.media[0]?.url ? [{ url: work.media[0].url }] : undefined,
    },
    alternates: { canonical: `/${locale}/works/${id}` },
  };
}

export default async function WorkPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const viewer = await getCurrentUser();
  const work = await getWorkForViewer(id, viewer?.id ?? null);
  if (!work) notFound();

  const [t, tTax, liked, commentsOn] = await Promise.all([
    getTranslations('works'),
    getTranslations('taxonomy'),
    isLikedByViewer(work.id, viewer?.id ?? null),
    commentsEnabled(),
  ]);

  // Комментарии (§4.3, post-MVP №5). Что видно скрытым и удалённым, решает
  // сервер: в разметку уезжает уже отфильтрованное.
  const [comments, commentSettings] = commentsOn
    ? await Promise.all([
        listWorkComments(
          work.id,
          viewer ? { id: viewer.id, role: viewer.role } : null,
          work.designerId,
        ),
        getSettings(['comment_max_length']),
      ])
    : [[], { comment_max_length: 2000 }];

  const maxCommentLength = commentSettings.comment_max_length;

  // Просмотр считаем по пользователю, а для гостя — по IP: этого хватает,
  // чтобы счётчик не накручивался перезагрузкой страницы.
  if (!work.isOwner) {
    const headerList = await headers();
    const viewerKey =
      viewer?.id ?? headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
    await registerWorkView(work.id, viewerKey);
  }

  const shareUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/${locale}/works/${work.id}`;

  const techRows = [
    work.polycount !== null
      ? { label: t('detail.polycount'), value: work.polycount.toLocaleString(locale) }
      : null,
    work.textureInfo ? { label: t('detail.textures'), value: work.textureInfo } : null,
    work.formats.length > 0 ? { label: t('detail.formats'), value: work.formats.join(', ') } : null,
    work.timeSpentHours !== null
      ? { label: t('detail.timeSpent'), value: t('detail.hours', { count: work.timeSpentHours }) }
      : null,
  ].filter((row): row is { label: string; value: string } => row !== null);

  // Описание работы читается на языке зрителя (§4.7); автору перевод не нужен.
  const description =
    work.description && viewer?.translateContent && !work.isOwner
      ? await translateField({
          entity: 'work',
          entityId: work.id,
          field: 'description',
          text: work.description,
          targetLocale: locale as Locale,
          viewerId: viewer.id,
        })
      : work.description
        ? { text: work.description, original: work.description, translated: false }
        : null;

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{work.title}</h1>

          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Link
              href={`/designers/${work.designer.nickname}`}
              className="font-medium text-fg hover:text-accent"
            >
              @{work.designer.nickname}
            </Link>

            {work.badgeOnPlatform ? (
              <Badge variant="accent">{t('badgeOnPlatform')}</Badge>
            ) : null}

            {work.visibility === 'link_only' ? (
              <Badge variant="warning">{t('linkOnly')}</Badge>
            ) : null}

            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden />
              {work.views}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LikeButton
            workId={work.id}
            initialLiked={liked}
            initialCount={work.likesCount}
            canLike={Boolean(viewer?.emailVerifiedAt)}
          />

          {work.isOwner ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/works/${work.id}/edit`}>
                  <Pencil aria-hidden />
                  {t('edit')}
                </Link>
              </Button>
              <DeleteWorkButton workId={work.id} nickname={work.designer.nickname} />
            </>
          ) : null}
        </div>
      </header>

      {/* Медиа — герой экрана (§5.1). */}
      <div className="flex flex-col gap-3">
        {work.media.map((media) =>
          media.type === 'video' ? (
            <video
              key={media.id}
              src={media.url}
              controls
              playsInline
              className="w-full rounded-[var(--radius-card)] border border-[var(--pf-border)] bg-black"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={media.id}
              src={media.url}
              alt={work.title}
              width={media.width ?? undefined}
              height={media.height ?? undefined}
              className="w-full rounded-[var(--radius-card)] border border-[var(--pf-border)] bg-surface-2"
            />
          ),
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-5">
          {description ? (
            <TranslatedText
              className="text-sm leading-relaxed whitespace-pre-line text-fg-muted"
              text={description.text}
              original={description.original}
              translated={description.translated}
            />
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {work.assetType ? (
              <Badge variant="accent">{tTax(`assetType.${work.assetType}`)}</Badge>
            ) : null}
            {work.styles.map((style) => (
              <Badge key={style} variant="outline">
                {tTax(`style.${style}`)}
              </Badge>
            ))}
            {work.software.map((item) => (
              <Badge key={item} variant="neutral">
                {item}
              </Badge>
            ))}
            {work.engines.map((item) => (
              <Badge key={item} variant="neutral">
                {item}
              </Badge>
            ))}
          </div>

          {!work.isOwner ? <ReportDialog targetType="work" targetId={work.id} /> : null}

          {/* Комментарии (§4.3, post-MVP №5). */}
          {commentsOn ? (
            <WorkComments
              workId={work.id}
              maxLength={maxCommentLength}
              canWrite={Boolean(viewer?.emailVerifiedAt)}
              isGuest={!viewer}
              initial={comments}
            />
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          {techRows.length > 0 ? (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">{t('detail.tech')}</h2>
                <dl className="flex flex-col gap-2 text-sm">
                  {techRows.map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-fg-muted">{row.label}</dt>
                      <dd className="text-right font-mono">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">{t('detail.share')}</h2>
              <p className="flex items-center gap-2 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 font-mono text-xs break-all text-fg-muted">
                <Link2 className="size-3.5 shrink-0" aria-hidden />
                {shareUrl}
              </p>

              {/* Открывает конструктор ТЗ с этой работой в референсах (§4.5). */}
              <OrderSimilarButton workId={work.id} canOrder={Boolean(viewer?.emailVerifiedAt)} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}

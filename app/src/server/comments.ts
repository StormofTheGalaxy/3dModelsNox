import 'server-only';

import { prisma, type Prisma } from '@polyforge/db';

import { getSetting } from './settings';

/**
 * Комментарии к работам (§4.3, post-MVP №5).
 *
 * Ветка ровно на два уровня: комментарий и ответы на него. Глубже — это
 * лесенка отступов, в которой на телефоне не видно ни вопроса, ни ответа,
 * а обсуждение картинки такого не стоит.
 */

export interface CommentView {
  id: string;
  authorId: string;
  nickname: string;
  avatarUrl: string | null;
  text: string;
  /** ISO-строка, а не Date: этот тип пересекает границу серверных действий. */
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  hidden: boolean;
  /** Зритель — автор комментария: ему доступны правка и удаление. */
  isOwn: boolean;
  /** Зритель может скрыть: автор работы или модератор (§4.3). */
  canHide: boolean;
  replies: CommentView[];
}

export async function commentsEnabled(): Promise<boolean> {
  return getSetting('feature_work_comments');
}

const COMMENT_SELECT = {
  id: true,
  authorId: true,
  parentId: true,
  text: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  hiddenAt: true,
  author: {
    select: {
      nickname: true,
      designerProfile: { select: { avatarUrl: true } },
      customerProfile: { select: { avatarUrl: true } },
    },
  },
} satisfies Prisma.WorkCommentSelect;

type CommentRow = Prisma.WorkCommentGetPayload<{ select: typeof COMMENT_SELECT }>;

/**
 * Что показывать вместо текста скрытого или удалённого комментария.
 *
 * Строка остаётся в ленте, если на неё отвечали: убрать её значит оставить
 * ответы без вопроса. Свой скрытый комментарий автор видит — иначе он будет
 * писать заново, не понимая, почему первого нет.
 */
function visibleText(row: CommentRow, viewerId: string | null, canModerate: boolean): string | null {
  if (row.deletedAt) return null;
  if (!row.hiddenAt) return row.text;
  if (canModerate || viewerId === row.authorId) return row.text;
  return null;
}

function toView(
  row: CommentRow,
  viewerId: string | null,
  canModerate: boolean,
  replies: CommentView[],
): CommentView {
  const text = visibleText(row, viewerId, canModerate);

  return {
    id: row.id,
    authorId: row.authorId,
    nickname: row.author.nickname,
    avatarUrl: row.author.designerProfile?.avatarUrl ?? row.author.customerProfile?.avatarUrl ?? null,
    text: text ?? '',
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deleted: row.deletedAt !== null,
    hidden: row.hiddenAt !== null,
    isOwn: viewerId !== null && viewerId === row.authorId,
    canHide: canModerate && row.hiddenAt === null && row.deletedAt === null,
    replies,
  };
}

export async function listWorkComments(
  workId: string,
  viewer: { id: string; role: string } | null,
  workAuthorId: string,
): Promise<CommentView[]> {
  const rows = await prisma.workComment.findMany({
    where: { workId },
    orderBy: { createdAt: 'asc' },
    select: COMMENT_SELECT,
  });

  const canModerate =
    viewer !== null &&
    (viewer.id === workAuthorId || ['moderator', 'arbiter', 'admin'].includes(viewer.role));

  const repliesByParent = new Map<string, CommentRow[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = repliesByParent.get(row.parentId) ?? [];
    list.push(row);
    repliesByParent.set(row.parentId, list);
  }

  return rows
    .filter((row) => !row.parentId)
    .map((row) => {
      const replies = (repliesByParent.get(row.id) ?? []).map((reply) =>
        toView(reply, viewer?.id ?? null, canModerate, []),
      );

      return toView(row, viewer?.id ?? null, canModerate, replies);
    })
    // Пустая ветка целиком (удалённый корень без ответов) не показывается:
    // «комментарий удалён» без продолжения — это шум.
    .filter((view) => !(view.deleted && view.replies.length === 0))
    .filter((view) => !(view.hidden && !view.isOwn && !canModerate && view.replies.length === 0));
}

/**
 * Пересчёт счётчика на работе. Считается по видимым: скрытый комментарий
 * не должен обещать в галерее обсуждение, которого читатель не увидит.
 */
export async function recountComments(workId: string): Promise<void> {
  const count = await prisma.workComment.count({
    where: { workId, deletedAt: null, hiddenAt: null },
  });

  await prisma.portfolioWork.update({ where: { id: workId }, data: { commentsCount: count } });
}

'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { commentsEnabled, listWorkComments, recountComments, type CommentView } from '../comments';
import { notify } from '../notifications';
import { checkRateLimit } from '../ratelimit';
import { getSettings } from '../settings';

/**
 * Действия над комментариями к работам (§4.3, post-MVP №5).
 *
 * Писать может только подтверждённый пользователь: комментарии — публичная
 * поверхность, и открывать её неподтверждённым аккаунтам значит открывать
 * её спаму.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; values?: Record<string, string | number> };

async function loadWork(workId: string) {
  return prisma.portfolioWork.findUnique({
    where: { id: workId },
    select: { id: true, title: true, designerId: true, isHidden: true, visibility: true },
  });
}

export async function postComment(
  workId: string,
  text: string,
  parentId?: string,
): Promise<Result<{ comments: CommentView[] }>> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  if (!(await commentsEnabled())) return { ok: false, error: 'errors.comment.disabled' };

  const { comment_max_length: maxLength } = await getSettings(['comment_max_length']);
  const body = text.trim();

  if (body.length === 0) return { ok: false, error: 'errors.comment.empty' };
  if (body.length > maxLength) {
    return { ok: false, error: 'errors.comment.tooLong', values: { limit: maxLength } };
  }

  const limit = await checkRateLimit('comment', user.id);
  if (!limit.allowed) {
    return { ok: false, error: 'errors.rateLimited', values: { seconds: limit.retryAfterSeconds } };
  }

  const work = await loadWork(workId);
  if (!work || work.isHidden) return { ok: false, error: 'errors.notFound' };

  // Ответ возможен только на корневой комментарий этой же работы: иначе
  // «одноуровневые ответы» превращаются в дерево через подмену parentId.
  let parent: { id: string; authorId: string } | null = null;

  if (parentId) {
    const found = await prisma.workComment.findUnique({
      where: { id: parentId },
      select: { id: true, workId: true, parentId: true, authorId: true, deletedAt: true },
    });

    if (!found || found.workId !== workId || found.parentId !== null || found.deletedAt) {
      return { ok: false, error: 'errors.comment.badParent' };
    }

    parent = { id: found.id, authorId: found.authorId };
  }

  await prisma.workComment.create({
    data: { workId, authorId: user.id, parentId: parent?.id ?? null, text: body },
  });

  await recountComments(workId);

  // Автору работы — о новом комментарии, автору ветки — об ответе. Себе
  // уведомления не шлём: человек только что это написал.
  if (work.designerId !== user.id) {
    await notify({
      userId: work.designerId,
      type: 'work_comment',
      payload: { workTitle: work.title, author: user.nickname },
      link: `/works/${workId}`,
    });
  }

  if (parent && parent.authorId !== user.id && parent.authorId !== work.designerId) {
    await notify({
      userId: parent.authorId,
      type: 'work_comment_reply',
      payload: { workTitle: work.title, author: user.nickname },
      link: `/works/${workId}`,
    });
  }

  revalidatePath(`/works/${workId}`);

  return {
    ok: true,
    comments: await listWorkComments(workId, { id: user.id, role: user.role }, work.designerId),
  };
}

export async function editComment(
  commentId: string,
  text: string,
): Promise<Result<{ comments: CommentView[] }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const { comment_max_length: maxLength, comment_edit_minutes: editMinutes } = await getSettings([
    'comment_max_length',
    'comment_edit_minutes',
  ]);

  const body = text.trim();
  if (body.length === 0) return { ok: false, error: 'errors.comment.empty' };
  if (body.length > maxLength) {
    return { ok: false, error: 'errors.comment.tooLong', values: { limit: maxLength } };
  }

  const comment = await prisma.workComment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, workId: true, createdAt: true, deletedAt: true, hiddenAt: true },
  });

  if (!comment || comment.authorId !== user.id) return { ok: false, error: 'errors.forbidden' };
  if (comment.deletedAt || comment.hiddenAt) return { ok: false, error: 'errors.comment.locked' };

  // Окно правки: после него остаётся только удалить. Иначе комментарий,
  // на который уже ответили, можно молча переписать во что угодно.
  const openUntil = comment.createdAt.getTime() + editMinutes * 60 * 1000;
  if (editMinutes === 0 || Date.now() > openUntil) {
    return { ok: false, error: 'errors.comment.editWindowClosed', values: { minutes: editMinutes } };
  }

  await prisma.workComment.update({
    where: { id: commentId },
    data: { text: body, editedAt: new Date() },
  });

  const work = await loadWork(comment.workId);
  revalidatePath(`/works/${comment.workId}`);

  return {
    ok: true,
    comments: await listWorkComments(
      comment.workId,
      { id: user.id, role: user.role },
      work?.designerId ?? '',
    ),
  };
}

export async function deleteComment(commentId: string): Promise<Result<{ comments: CommentView[] }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const comment = await prisma.workComment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, workId: true, deletedAt: true },
  });

  if (!comment || comment.authorId !== user.id) return { ok: false, error: 'errors.forbidden' };

  if (!comment.deletedAt) {
    // Мягкое удаление: текст стирается, строка остаётся ради ответов.
    await prisma.workComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date(), text: '' },
    });

    await recountComments(comment.workId);
  }

  const work = await loadWork(comment.workId);
  revalidatePath(`/works/${comment.workId}`);

  return {
    ok: true,
    comments: await listWorkComments(
      comment.workId,
      { id: user.id, role: user.role },
      work?.designerId ?? '',
    ),
  };
}

/**
 * Скрытие автором работы или модератором (§4.3, пост-модерация).
 *
 * Автор работы вправе убрать комментарий со своей страницы, но действие
 * пишется в аудит-лог, а сам комментатор продолжает видеть свой текст с
 * пометкой: тихое стирание чужих слов — это то, за чем нужен след.
 */
export async function hideComment(commentId: string): Promise<Result<{ comments: CommentView[] }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const comment = await prisma.workComment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      workId: true,
      authorId: true,
      hiddenAt: true,
      work: { select: { designerId: true } },
    },
  });

  if (!comment) return { ok: false, error: 'errors.notFound' };

  const isStaff = ['moderator', 'arbiter', 'admin'].includes(user.role);
  if (comment.work.designerId !== user.id && !isStaff) {
    return { ok: false, error: 'errors.forbidden' };
  }

  if (!comment.hiddenAt) {
    await prisma.workComment.update({
      where: { id: commentId },
      data: { hiddenAt: new Date(), hiddenById: user.id },
    });

    await recountComments(comment.workId);

    await writeAuditLog({
      action: 'comment.hidden',
      actorId: user.id,
      targetType: 'comment',
      targetId: commentId,
      payload: { workId: comment.workId, authorId: comment.authorId, byStaff: isStaff },
    });
  }

  revalidatePath(`/works/${comment.workId}`);

  return {
    ok: true,
    comments: await listWorkComments(
      comment.workId,
      { id: user.id, role: user.role },
      comment.work.designerId,
    ),
  };
}

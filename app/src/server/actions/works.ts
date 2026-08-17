'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { reportSchema, workSchema } from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { storeWorkMedia } from '../media';
import { enqueueStorageCleanup } from '../queue';
import { checkRateLimit } from '../ratelimit';
import { getSetting } from '../settings';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom, jsonField, numberField, stringListField } from './form';

/**
 * Портфолио (§4.3).
 *
 * Работа создаётся черновиком до загрузки файлов: медиа должны на что-то
 * ссылаться, а форма позволяет докладывать файлы по одному.
 */

/** Черновик, к которому клиент прикрепляет загружаемые файлы. */
export async function createWorkDraft(): Promise<{ workId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { error: 'errors.forbidden' };

  const profile = await prisma.designerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!profile) return { error: 'errors.work.designerProfileRequired' };

  // Незавершённые черновики не должны копиться: переиспользуем последний,
  // если пользователь просто перезагрузил страницу.
  const existingDraft = await prisma.portfolioWork.findFirst({
    where: { designerId: user.id, title: '' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (existingDraft) return { workId: existingDraft.id };

  const draft = await prisma.portfolioWork.create({
    data: { designerId: user.id, title: '', visibility: 'public', isHidden: true },
    select: { id: true },
  });

  return { workId: draft.id };
}

export async function uploadWorkMedia(
  formData: FormData,
): Promise<
  | { ok: true; media: { id: string; url: string; type: string; status: string } }
  | { ok: false; error: string; values?: Record<string, string | number> }
> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  const limit = await checkRateLimit('upload', user.id);
  if (!limit.allowed) {
    return {
      ok: false,
      error: 'errors.rateLimited',
      values: { seconds: limit.retryAfterSeconds },
    };
  }

  const workId = formData.get('workId');
  const file = formData.get('file');

  if (typeof workId !== 'string' || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'errors.upload.failed' };
  }

  const work = await prisma.portfolioWork.findUnique({
    where: { id: workId },
    select: { designerId: true, media: { select: { id: true } } },
  });

  // Проверка владения на сервере, а не только в UI (§9 DoD).
  if (!work || work.designerId !== user.id) {
    return { ok: false, error: 'errors.forbidden' };
  }

  const maxImages = await getSetting('work_images_max');
  if (work.media.length >= maxImages) {
    return { ok: false, error: 'errors.upload.tooMany', values: { limit: maxImages } };
  }

  const result = await storeWorkMedia(file, workId, user.id, work.media.length);
  if (!result.ok) {
    return { ok: false, error: result.error, values: result.values };
  }

  return { ok: true, media: result.media };
}

export async function deleteWorkMedia(mediaId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const media = await prisma.workMedia.findUnique({
    where: { id: mediaId },
    select: { storageKey: true, work: { select: { designerId: true } } },
  });

  if (!media || media.work.designerId !== user.id) return { ok: false };

  await prisma.workMedia.delete({ where: { id: mediaId } });
  await enqueueStorageCleanup([media.storageKey]);

  return { ok: true };
}

export async function saveWork(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  const workId = formData.get('workId');
  if (typeof workId !== 'string') return errorState('errors.generic');

  const parsed = workSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    assetType: formData.get('assetType') || null,
    styles: jsonField(formData.get('styles')),
    software: stringListField(formData.get('software')),
    engines: stringListField(formData.get('engines')),
    polycount: numberField(formData.get('polycount')),
    textureInfo: formData.get('textureInfo') ?? '',
    formats: stringListField(formData.get('formats')),
    timeSpentHours: numberField(formData.get('timeSpentHours')),
    visibility: formData.get('visibility') ?? 'public',
    mediaIds: jsonField(formData.get('mediaIds')),
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const input = parsed.data;

  const work = await prisma.portfolioWork.findUnique({
    where: { id: workId },
    select: { designerId: true, title: true, media: { select: { id: true } } },
  });

  if (!work || work.designerId !== user.id) return errorState('errors.forbidden');

  const ownedMediaIds = new Set(work.media.map((item) => item.id));
  const orderedMedia = input.mediaIds.filter((id) => ownedMediaIds.has(id));

  if (orderedMedia.length === 0) {
    return errorState('errors.generic', { fieldErrors: { mediaIds: 'errors.work.mediaRequired' } });
  }

  const isFirstPublish = work.title === '';

  await prisma.$transaction([
    prisma.portfolioWork.update({
      where: { id: workId },
      data: {
        title: input.title,
        description: input.description || null,
        assetType: input.assetType,
        styles: input.styles,
        software: input.software,
        engines: input.engines,
        polycount: input.polycount,
        textureInfo: input.textureInfo || null,
        formats: input.formats,
        timeSpentHours: input.timeSpentHours,
        visibility: input.visibility,
        // Токен нужен, только если работа доступна по ссылке.
        shareToken:
          input.visibility === 'link_only' ? randomBytes(16).toString('base64url') : null,
        isHidden: false,
        ...(isFirstPublish ? { publishedAt: new Date() } : {}),
      },
    }),
    // Порядок медиа задаётся перетаскиванием в форме.
    ...orderedMedia.map((mediaId, index) =>
      prisma.workMedia.update({ where: { id: mediaId }, data: { order: index } }),
    ),
  ]);

  revalidatePath('/works');
  revalidatePath(`/works/${workId}`);
  revalidatePath(`/designers/${user.nickname}`);

  return successState({ message: 'settings.saved', redirectTo: `/works/${workId}` });
}

export async function deleteWork(workId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const work = await prisma.portfolioWork.findUnique({
    where: { id: workId },
    select: { designerId: true, media: { select: { storageKey: true } } },
  });

  if (!work || work.designerId !== user.id) return { ok: false };

  await prisma.portfolioWork.delete({ where: { id: workId } });
  await enqueueStorageCleanup(work.media.map((item) => item.storageKey));

  revalidatePath('/works');
  revalidatePath(`/designers/${user.nickname}`);

  return { ok: true };
}

/**
 * Лайк. Счётчик денормализован в `likesCount`, поэтому меняем его в одной
 * транзакции со вставкой — иначе сетка галереи разъедется с реальностью.
 */
export async function toggleWorkLike(
  workId: string,
): Promise<{ ok: boolean; liked: boolean; likesCount: number }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, liked: false, likesCount: 0 };

  const existing = await prisma.workLike.findUnique({
    where: { workId_userId: { workId, userId: user.id } },
    select: { id: true },
  });

  try {
    if (existing) {
      const [, work] = await prisma.$transaction([
        prisma.workLike.delete({ where: { id: existing.id } }),
        prisma.portfolioWork.update({
          where: { id: workId },
          data: { likesCount: { decrement: 1 } },
          select: { likesCount: true },
        }),
      ]);
      return { ok: true, liked: false, likesCount: work.likesCount };
    }

    const [, work] = await prisma.$transaction([
      prisma.workLike.create({ data: { workId, userId: user.id } }),
      prisma.portfolioWork.update({
        where: { id: workId },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      }),
    ]);
    return { ok: true, liked: true, likesCount: work.likesCount };
  } catch {
    // Двойной клик мог создать гонку — отдаём актуальное состояние из БД.
    const work = await prisma.portfolioWork.findUnique({
      where: { id: workId },
      select: { likesCount: true },
    });
    return { ok: false, liked: Boolean(existing), likesCount: work?.likesCount ?? 0 };
  }
}

/** Жалоба на объект платформы (§4.3, §4.10). Разбор — в админке фазы 7. */
export async function submitReport(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  const parsed = reportSchema.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    category: formData.get('category'),
    text: formData.get('text') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const input = parsed.data;

  const limit = await checkRateLimit('response', `report:${user.id}`);
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  try {
    await prisma.report.create({
      data: {
        reporterId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        category: input.category,
        text: input.text || null,
      },
    });
  } catch {
    // Повторная жалоба того же пользователя на тот же объект — не ошибка
    // для отправителя, но и второй записи не создаём.
    return successState({ message: 'report.alreadySent' });
  }

  await writeAuditLog({
    action: 'report.created',
    actorId: user.id,
    targetType: input.targetType,
    targetId: input.targetId,
    payload: { category: input.category },
  });

  return successState({ message: 'report.sent' });
}

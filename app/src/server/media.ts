import 'server-only';

import { prisma } from '@polyforge/db';
import {
  PURPOSE_LIMITS,
  mediaKindFromMime,
  type MediaPurpose,
} from '@polyforge/shared';
import { buildStorageKey, extensionFromMime } from '@polyforge/storage';

import { enqueueImageProcessing } from './queue';
import { getSettings } from './settings';
import { storage } from './storage';

/**
 * Приём загруженных файлов (§2.4).
 *
 * Файл идёт через приложение, а не напрямую в S3 по подписанной ссылке:
 * так проверка типа, размера и прав остаётся на сервере, а локальный драйвер
 * для разработки работает по тому же пути, что и прод.
 */

export type UploadFailure =
  | 'errors.upload.unsupportedType'
  | 'errors.upload.tooLarge'
  | 'errors.upload.failed';

export interface UploadedMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  /** `failed` появляется, когда воркер не смог собрать превью. */
  status: 'processing' | 'ready' | 'failed';
}

export type UploadResult =
  | { ok: true; media: UploadedMedia }
  | { ok: false; error: UploadFailure; values?: Record<string, string | number> };

/** Максимальный размер для типа файла: пороги живут в настройках платформы. */
async function maxBytesFor(kind: 'image' | 'video', purpose: MediaPurpose): Promise<number> {
  const { upload_image_mb, upload_video_mb } = await getSettings([
    'upload_image_mb',
    'upload_video_mb',
  ]);

  const platformMb = kind === 'image' ? upload_image_mb : upload_video_mb;
  // Аватар и обложка ограничены жёстче самой платформы.
  return Math.min(platformMb, PURPOSE_LIMITS[purpose].maxMb) * 1024 * 1024;
}

/**
 * Сохраняет файл работы и создаёт запись WorkMedia в статусе `processing`.
 * Работа на этом этапе ещё не существует — медиа привязывается к ней при
 * сохранении формы, поэтому `workId` приходит уже созданной черновой работой.
 */
export async function storeWorkMedia(
  file: File,
  workId: string,
  ownerId: string,
  order: number,
): Promise<UploadResult> {
  const kind = mediaKindFromMime(file.type);
  if (!kind) {
    return { ok: false, error: 'errors.upload.unsupportedType' };
  }

  const limit = await maxBytesFor(kind, 'work');
  if (file.size > limit) {
    return {
      ok: false,
      error: 'errors.upload.tooLarge',
      values: { limit: Math.round(limit / (1024 * 1024)) },
    };
  }

  const key = buildStorageKey('works', ownerId, extensionFromMime(file.type));

  try {
    await storage().put('public', key, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
    });
  } catch (error) {
    console.error('[media] загрузка в хранилище не удалась', error);
    return { ok: false, error: 'errors.upload.failed' };
  }

  const media = await prisma.workMedia.create({
    data: {
      workId,
      type: kind,
      // Видео воркер не трогает: перекодирование в MVP не требуется.
      status: kind === 'image' ? 'processing' : 'ready',
      storageKey: key,
      url: storage().publicUrl(key),
      sizeBytes: file.size,
      order,
    },
    select: { id: true, url: true, type: true, status: true },
  });

  if (kind === 'image') {
    await enqueueImageProcessing({ mediaId: media.id, storageKey: key });
  }

  return { ok: true, media };
}

/** Аватар и обложка: одно изображение, сразу готовое к показу. */
export async function storeProfileImage(
  file: File,
  ownerId: string,
  purpose: 'avatar' | 'cover',
): Promise<{ ok: true; url: string } | { ok: false; error: UploadFailure; values?: Record<string, string | number> }> {
  const kind = mediaKindFromMime(file.type);
  if (kind !== 'image') {
    return { ok: false, error: 'errors.upload.unsupportedType' };
  }

  const limit = await maxBytesFor('image', purpose);
  if (file.size > limit) {
    return {
      ok: false,
      error: 'errors.upload.tooLarge',
      values: { limit: Math.round(limit / (1024 * 1024)) },
    };
  }

  const key = buildStorageKey(purpose, ownerId, extensionFromMime(file.type));

  try {
    await storage().put('public', key, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
    });
  } catch (error) {
    console.error('[media] загрузка изображения профиля не удалась', error);
    return { ok: false, error: 'errors.upload.failed' };
  }

  return { ok: true, url: storage().publicUrl(key) };
}

import sharp from 'sharp';

import { prisma } from '@polyforge/db';
import { IMAGE_DERIVATIVES } from '@polyforge/shared';
import { derivedKey } from '@polyforge/storage';

import { storage } from '../storage';

/**
 * Сжатие и конвертация в webp (§7, фаза 1).
 *
 * Оригинал остаётся в хранилище: он нужен, если понадобится пересобрать
 * производные другого размера. Наружу отдаются только webp-версии.
 */

export interface ProcessImagePayload {
  mediaId: string;
  storageKey: string;
}

export async function processImage(payload: ProcessImagePayload): Promise<void> {
  const media = await prisma.workMedia.findUnique({
    where: { id: payload.mediaId },
    select: { id: true, type: true, status: true },
  });

  // Работу могли удалить, пока задача ждала очереди.
  if (!media || media.type !== 'image') return;

  const store = storage();
  const original = await store.get('public', payload.storageKey);

  const image = sharp(original, { failOn: 'none' });
  const metadata = await image.metadata();

  const displayKey = derivedKey(payload.storageKey, 'display');
  const thumbKey = derivedKey(payload.storageKey, 'thumb');

  // `withoutEnlargement` не даёт растянуть маленькую картинку до 1600px
  // и получить размытый файл тяжелее оригинала.
  const [displayBuffer, thumbBuffer] = await Promise.all([
    sharp(original, { failOn: 'none' })
      .rotate()
      .resize({ width: IMAGE_DERIVATIVES.display.width, withoutEnlargement: true })
      .webp({ quality: IMAGE_DERIVATIVES.display.quality })
      .toBuffer(),
    sharp(original, { failOn: 'none' })
      .rotate()
      .resize({ width: IMAGE_DERIVATIVES.thumbnail.width, withoutEnlargement: true })
      .webp({ quality: IMAGE_DERIVATIVES.thumbnail.quality })
      .toBuffer(),
  ]);

  await Promise.all([
    store.put('public', displayKey, displayBuffer, { contentType: 'image/webp' }),
    store.put('public', thumbKey, thumbBuffer, { contentType: 'image/webp' }),
  ]);

  // EXIF может повернуть картинку: после `rotate()` стороны меняются местами.
  const rotated = metadata.orientation !== undefined && metadata.orientation >= 5;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;

  await prisma.workMedia.update({
    where: { id: media.id },
    data: {
      status: 'ready',
      url: store.publicUrl(displayKey),
      thumbnailUrl: store.publicUrl(thumbKey),
      width: width ?? null,
      height: height ?? null,
    },
  });
}

/** Помечает медиа как непригодное, чтобы UI не показывал вечный спиннер. */
export async function markImageFailed(mediaId: string): Promise<void> {
  await prisma.workMedia
    .update({ where: { id: mediaId }, data: { status: 'failed' } })
    .catch(() => undefined);
}

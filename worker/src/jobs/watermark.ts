import sharp from 'sharp';

import { prisma } from '@polyforge/db';
import { derivedKey } from '@polyforge/storage';

import { storage } from '../storage';

/**
 * Водяной знак на превью финального этапа (§4.6).
 *
 * До подтверждения оплаты заказчик видит работу, но не может ей
 * воспользоваться. Это единственная защита, которую платформа способна дать
 * дизайнеру, не участвуя в расчётах: денег она не держит и вернуть их
 * не может.
 *
 * Знак — повторяющаяся диагональная плашка поверх изображения: обрезать её
 * без потери самой картинки нельзя, в отличие от подписи в углу.
 */

export interface WatermarkPayload {
  deliveryFileId: string;
}

const TILE = 320;

function watermarkTile(text: string): Buffer {
  const safe = text.replace(/[<&>]/gu, '').slice(0, 40);

  return Buffer.from(
    `<svg width="${TILE}" height="${TILE}" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="50%" fill="rgba(255,255,255,0.38)" font-size="26"
            font-family="sans-serif" text-anchor="middle"
            transform="rotate(-30 ${TILE / 2} ${TILE / 2})">${safe}</text>
    </svg>`,
  );
}

export async function applyWatermark(payload: WatermarkPayload): Promise<void> {
  const file = await prisma.deliveryFile.findUnique({
    where: { id: payload.deliveryFileId },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      watermarkPending: true,
      delivery: {
        select: { milestone: { select: { deal: { select: { id: true } } } } },
      },
    },
  });

  // Сдачу могли перезалить, пока задача ждала очереди.
  if (!file || !file.watermarkPending) return;
  if (!file.mimeType.startsWith('image/')) {
    await prisma.deliveryFile.update({
      where: { id: file.id },
      data: { watermarkPending: false },
    });
    return;
  }

  const store = storage();
  const original = await store.get('private', file.storageKey);

  const metadata = await sharp(original, { failOn: 'none' }).metadata();
  const width = Math.min(metadata.width ?? 1600, 1600);

  const resized = await sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .toBuffer();

  const tile = await sharp(watermarkTile('PolyForge · preview'))
    .resize(TILE, TILE)
    .png()
    .toBuffer();

  // Плитка растягивается на всё изображение: `tile: true` повторяет её.
  const watermarked = await sharp(resized)
    .composite([{ input: tile, tile: true, blend: 'over' }])
    .webp({ quality: 82 })
    .toBuffer();

  const key = derivedKey(file.storageKey, 'wm');
  await store.put('public', key, watermarked, { contentType: 'image/webp' });

  await prisma.deliveryFile.update({
    where: { id: file.id },
    data: { watermarkedUrl: store.publicUrl(key), watermarkPending: false },
  });
}

/** Знак не собрался: снимаем флаг, иначе UI ждёт превью бесконечно. */
export async function markWatermarkFailed(deliveryFileId: string): Promise<void> {
  await prisma.deliveryFile
    .update({ where: { id: deliveryFileId }, data: { watermarkPending: false } })
    .catch(() => undefined);
}

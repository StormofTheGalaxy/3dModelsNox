/**
 * Правила загрузки медиа (§2.4). Пороги размеров живут в настройках платформы,
 * а типы файлов — здесь: их изменение требует правок в обработчике воркера.
 */

export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export type MediaKind = 'image' | 'video';

export function mediaKindFromMime(mime: string): MediaKind | null {
  if ((ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) return 'image';
  if ((ALLOWED_VIDEO_MIME as readonly string[]).includes(mime)) return 'video';
  return null;
}

/** Размеры производных изображений, которые готовит воркер. */
export const IMAGE_DERIVATIVES = {
  /** Превью в сетке галереи. */
  thumbnail: { width: 640, quality: 78 },
  /** Основной показ на странице работы. */
  display: { width: 1600, quality: 82 },
} as const;

export const MEDIA_PURPOSES = ['work', 'avatar', 'cover'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/** Аватар и обложка — только изображения и заметно меньше работ. */
export const PURPOSE_LIMITS: Record<MediaPurpose, { maxMb: number; kinds: MediaKind[] }> = {
  work: { maxMb: 200, kinds: ['image', 'video'] },
  avatar: { maxMb: 8, kinds: ['image'] },
  cover: { maxMb: 12, kinds: ['image'] },
};

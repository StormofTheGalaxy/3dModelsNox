'use server';

import { galleryQuerySchema } from '@polyforge/shared';

import { listGalleryWorks } from '../works';
import type { WorkCardData } from '@/components/works/work-card';

/**
 * Догрузка галереи для бесконечного скролла (§4.3).
 *
 * Отдельный server action, а не route handler: тип результата виден клиенту
 * без ручной сериализации, а фильтры валидируются той же zod-схемой.
 */
export async function loadMoreWorks(input: {
  style?: string;
  assetType?: string;
  software?: string;
  sort?: string;
  cursor?: string;
}): Promise<{ items: WorkCardData[]; nextCursor: string | null }> {
  const parsed = galleryQuerySchema.safeParse({
    style: input.style || undefined,
    assetType: input.assetType || undefined,
    software: input.software || undefined,
    sort: input.sort || 'new',
    cursor: input.cursor || undefined,
    limit: 24,
  });

  if (!parsed.success) {
    return { items: [], nextCursor: null };
  }

  const { items, nextCursor } = await listGalleryWorks(parsed.data);

  return {
    items: items.map((work) => ({
      id: work.id,
      title: work.title,
      likesCount: work.likesCount,
      views: work.views,
      badgeOnPlatform: work.badgeOnPlatform,
      designer: { nickname: work.designer.nickname },
      media: work.media.map((media) => ({
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        width: media.width,
        height: media.height,
      })),
    })),
    nextCursor,
  };
}

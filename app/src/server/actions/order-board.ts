'use server';

import { orderFilterSchema } from '@polyforge/shared';

import { getCurrentUser } from '../auth/session';
import { listOrders, toOrderCardData } from '../orders';
import type { OrderCardData } from '@/components/orders/order-card';

/**
 * Догрузка витрины для бесконечного скролла (§4.5).
 * Отдельный action, чтобы клиент получал типизированный результат.
 */
export async function loadMoreOrders(input: {
  query?: string;
  assetType?: string;
  style?: string;
  engine?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  deadlineWithinDays?: number;
  verifiedCustomersOnly?: boolean;
  noResponsesOnly?: boolean;
  sort?: string;
  cursor?: string;
}): Promise<{ items: OrderCardData[]; nextCursor: string | null }> {
  const parsed = orderFilterSchema.safeParse({
    ...input,
    query: input.query || undefined,
    assetType: input.assetType || undefined,
    style: input.style || undefined,
    engine: input.engine || undefined,
    currency: input.currency || undefined,
    sort: input.sort || 'new',
    cursor: input.cursor || undefined,
    limit: 20,
  });

  if (!parsed.success) return { items: [], nextCursor: null };

  const viewer = await getCurrentUser();
  const { items, nextCursor } = await listOrders(parsed.data, viewer?.id ?? null);

  return { items: items.map(toOrderCardData), nextCursor };
}

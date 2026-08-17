import { z } from 'zod';

import { ART_STYLES, ASSET_TYPES, CURRENCIES } from '../domain/taxonomy';

/**
 * Витрина заказов и отклики (§4.5).
 */

export const ORDER_SORTS = ['new', 'budget_desc', 'budget_asc', 'deadline'] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export const COMPETITION_LEVELS = ['low', 'medium', 'high'] as const;
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];

/**
 * Публично показывается только градация конкуренции — точное число откликов
 * видит заказчик (§3). Иначе дизайнеры отсеивают заказы по счётчику, а не
 * по содержанию.
 */
export function competitionLevel(responsesCount: number): CompetitionLevel {
  if (responsesCount <= 3) return 'low';
  if (responsesCount <= 10) return 'medium';
  return 'high';
}

export const orderFilterSchema = z.object({
  query: z.string().trim().max(120).optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  style: z.enum(ART_STYLES).optional(),
  engine: z.string().trim().max(48).optional(),
  budgetMin: z.number().int().min(0).max(100_000_000).optional(),
  budgetMax: z.number().int().min(0).max(100_000_000).optional(),
  currency: z.enum(CURRENCIES).optional(),
  /** Заказы с дедлайном не позже чем через N дней. */
  deadlineWithinDays: z.number().int().min(1).max(365).optional(),
  verifiedCustomersOnly: z.boolean().default(false),
  /** «Без откликов» — точка входа для новичков. */
  noResponsesOnly: z.boolean().default(false),
  sort: z.enum(ORDER_SORTS).default('new'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(48).default(20),
});

export type OrderFilter = z.infer<typeof orderFilterSchema>;

/** Публикация заказа из готового ТЗ. */
export const orderPublishSchema = z
  .object({
    briefId: z.string().min(1),
    title: z.string().trim().min(5, 'errors.order.titleTooShort').max(140, 'errors.order.titleTooLong'),
    budgetMode: z.enum(['fixed', 'open']),
    budgetAmount: z.number().int().min(0).max(100_000_000).nullable().default(null),
    budgetCurrency: z.enum(CURRENCIES).default('USD'),
    deadline: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'errors.brief.invalidDate')
      .nullable()
      .default(null),
  })
  .refine(
    // §4.5: заказы «бесплатно» и «за отзыв» запрещены — либо сумма больше нуля,
    // либо честное «жду предложений».
    (data) => data.budgetMode === 'open' || (data.budgetAmount !== null && data.budgetAmount > 0),
    { message: 'errors.order.budgetRequired', path: ['budgetAmount'] },
  );

export type OrderPublishInput = z.infer<typeof orderPublishSchema>;

export const responseSchema = z.object({
  orderId: z.string().min(1),
  coverText: z
    .string()
    .trim()
    .min(30, 'errors.response.coverTooShort')
    .max(3000, 'errors.response.coverTooLong'),
  price: z.number().int().min(1, 'errors.response.priceRequired').max(100_000_000),
  currency: z.enum(CURRENCIES).default('USD'),
  days: z.number().int().min(1, 'errors.response.daysRequired').max(365),
  /** 1–3 работы из портфолио (§3). */
  attachedWorkIds: z
    .array(z.string().min(1))
    .min(1, 'errors.response.worksRequired')
    .max(3, 'errors.response.tooManyWorks'),
});

export type ResponseInput = z.infer<typeof responseSchema>;

export const RESPONSE_REJECT_REASONS = [
  'price_too_high',
  'timeline_too_long',
  'portfolio_mismatch',
  'chose_another',
  'order_cancelled',
  'other',
] as const;
export type ResponseRejectReason = (typeof RESPONSE_REJECT_REASONS)[number];

export const savedFilterSchema = z.object({
  title: z.string().trim().min(2, 'errors.savedFilter.titleTooShort').max(80),
  params: orderFilterSchema.partial(),
  notifyEmail: z.boolean().default(true),
  notifyInApp: z.boolean().default(true),
});

export type SavedFilterInput = z.infer<typeof savedFilterSchema>;

export const NOTIFICATION_TYPES = [
  'order_new_match',
  'order_response_received',
  'order_customer_inactive',
  'order_expiring',
  'response_status_changed',
  'response_accepted',
  'brief_shared',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

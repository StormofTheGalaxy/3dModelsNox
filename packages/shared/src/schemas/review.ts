import { z } from 'zod';

/**
 * Отзывы и репутация (§3, §4.8).
 */

export const REVIEW_STATUSES = ['hidden_pending', 'published', 'hidden_by_moderator'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_TARGET_ROLES = ['designer', 'customer'] as const;
export type ReviewTargetRole = (typeof REVIEW_TARGET_ROLES)[number];

/**
 * Подоценки различаются по роли (§3): дизайнера оценивают за качество,
 * сроки и коммуникацию, заказчика — за чёткость ТЗ, коммуникацию и оплату.
 * Ключи словаря выводятся из роли, поэтому набор объявлен здесь.
 */
export const REVIEW_SUBSCORES = {
  designer: ['quality', 'deadlines', 'communication'],
  customer: ['briefClarity', 'communication', 'payment'],
} as const;

const score = z.number().int().min(1, 'errors.review.scoreRequired').max(5);

export const reviewSchema = z.object({
  dealId: z.string().min(1),
  overall: score,
  sub1: score,
  sub2: score,
  sub3: score,
  text: z
    .string()
    .trim()
    .min(20, 'errors.review.textTooShort')
    .max(4000, 'errors.review.textTooLong'),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

export const reviewReplySchema = z.object({
  reviewId: z.string().min(1),
  reply: z
    .string()
    .trim()
    .min(10, 'errors.review.replyTooShort')
    .max(2000, 'errors.review.replyTooLong'),
});

/**
 * Взвешенный рейтинг с экспоненциальным затуханием (§4.8).
 *
 * Вес отзыва — 0.5^(возраст / полураспад): свежая оценка весит больше старой,
 * но старая никогда не обнуляется полностью. Так профиль отражает, каков
 * человек сейчас, не стирая при этом историю.
 */
export function weightedRating(
  reviews: { overall: number; publishedAt: Date | string }[],
  halfLifeDays: number,
  now = new Date(),
): { rating: number; count: number } {
  if (reviews.length === 0) return { rating: 0, count: 0 };

  const halfLifeMs = Math.max(halfLifeDays, 1) * 86_400_000;
  let weightSum = 0;
  let valueSum = 0;

  for (const review of reviews) {
    const published = new Date(review.publishedAt).getTime();
    const ageMs = Math.max(now.getTime() - published, 0);
    const weight = 0.5 ** (ageMs / halfLifeMs);

    weightSum += weight;
    valueSum += weight * review.overall;
  }

  if (weightSum === 0) return { rating: 0, count: reviews.length };

  // Округление до сотых: рейтинг показывается как «4.87».
  return { rating: Math.round((valueSum / weightSum) * 100) / 100, count: reviews.length };
}

export const VERIFICATION_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const verificationSubmitSchema = z.object({
  requestId: z.string().min(1),
  processNote: z
    .string()
    .trim()
    .min(100, 'errors.verification.processTooShort')
    .max(5000, 'errors.verification.processTooLong'),
});

export const verificationDecisionSchema = z.object({
  requestId: z.string().min(1),
  approve: z.boolean(),
  note: z.string().trim().max(2000).optional().default(''),
});

export const testTaskSchema = z.object({
  id: z.string().optional(),
  specialization: z.string().min(1),
  titleRu: z.string().trim().min(3).max(160),
  titleEn: z.string().trim().min(3).max(160),
  bodyRu: z.string().trim().min(30).max(6000),
  bodyEn: z.string().trim().min(30).max(6000),
  estimateHours: z.number().int().min(1).max(200),
  isActive: z.boolean().default(true),
});

export const strikeSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(3).max(120),
  note: z.string().trim().max(2000).optional().default(''),
  reportId: z.string().optional(),
});

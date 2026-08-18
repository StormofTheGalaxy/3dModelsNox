import { z } from 'zod';

import { CURRENCIES } from '../domain/taxonomy';

/**
 * Сделка: план этапов, сдачи, чеки, споры (§3, §4.6).
 */

export const DEAL_STATUSES = [
  'plan_agreement',
  'active',
  'paused',
  'in_dispute',
  'completed',
  'cancelled',
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const MILESTONE_STATUSES = [
  'pending',
  'in_work',
  'submitted',
  'revision',
  'accepted',
  'paid_claimed',
  'paid_confirmed',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const PAYMENT_METHODS = ['card', 'crypto', 'paypal', 'sbp', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MILESTONES_MIN = 1;
export const MILESTONES_MAX = 10;

/** Один этап плана. Сумма в целых единицах валюты — как и везде в проекте. */
export const milestoneInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'errors.deal.milestoneTitleTooShort')
    .max(120, 'errors.deal.milestoneTitleTooLong'),
  description: z.string().trim().max(1000).optional().default(''),
  amount: z.number().int().min(1, 'errors.deal.milestoneAmountRequired').max(100_000_000),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'errors.brief.invalidDate')
    .nullable()
    .default(null),
});

export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

/**
 * План этапов целиком. Сумма этапов обязана совпадать с ценой сделки:
 * иначе стороны спорят о том, за что именно платят.
 */
export const milestonePlanSchema = z.object({
  dealId: z.string().min(1),
  milestones: z
    .array(milestoneInputSchema)
    .min(MILESTONES_MIN, 'errors.deal.planEmpty')
    .max(MILESTONES_MAX, 'errors.deal.planTooLong'),
});

export type MilestonePlanInput = z.infer<typeof milestonePlanSchema>;

/** Шаблоны планов из ТЗ (§4.6) плюс произвольный. */
export const PLAN_TEMPLATES = {
  full: [100],
  half: [50, 50],
  thirds: [30, 40, 30],
} as const;

export type PlanTemplateKey = keyof typeof PLAN_TEMPLATES;

/**
 * Разбивка суммы по долям без потери копеек: остаток от округления
 * добавляется к последнему этапу, чтобы сумма сошлась ровно.
 */
export function splitByTemplate(total: number, template: PlanTemplateKey): number[] {
  const shares = PLAN_TEMPLATES[template];
  const amounts = shares.map((share) => Math.floor((total * share) / 100));
  const remainder = total - amounts.reduce((sum, amount) => sum + amount, 0);

  if (amounts.length > 0) {
    amounts[amounts.length - 1] = (amounts.at(-1) ?? 0) + remainder;
  }

  return amounts;
}

export const deliverySchema = z.object({
  milestoneId: z.string().min(1),
  note: z.string().trim().max(2000).optional().default(''),
});

export const paymentSchema = z.object({
  milestoneId: z.string().min(1),
  amount: z.number().int().min(1, 'errors.deal.paymentAmountRequired').max(100_000_000),
  currency: z.enum(CURRENCIES).default('USD'),
  method: z.enum(PAYMENT_METHODS).default('other'),
  txHash: z.string().trim().max(120).optional().default(''),
  note: z.string().trim().max(500).optional().default(''),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

export const revisionRequestSchema = z.object({
  milestoneId: z.string().min(1),
  comment: z
    .string()
    .trim()
    .min(10, 'errors.deal.revisionCommentRequired')
    .max(2000),
});

export const disputeOpenSchema = z.object({
  dealId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(30, 'errors.deal.disputeReasonTooShort')
    .max(3000),
});

export const DISPUTE_VERDICTS = ['designer_right', 'customer_right', 'mutual'] as const;
export type DisputeVerdict = (typeof DISPUTE_VERDICTS)[number];

export const disputeResolveSchema = z.object({
  disputeId: z.string().min(1),
  verdict: z.enum(DISPUTE_VERDICTS),
  resolutionNote: z.string().trim().min(20, 'errors.deal.resolutionRequired').max(3000),
});

export const chatMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  quotedMessageId: z.string().optional(),
});

/** Ключи системных сообщений ленты сделки (§4.7). */
export const SYSTEM_MESSAGE_KEYS = [
  'deal.created',
  'plan.proposed',
  'plan.confirmed',
  'milestone.started',
  'milestone.submitted',
  'milestone.revision',
  'milestone.accepted',
  'payment.claimed',
  'payment.confirmed',
  'deal.paused',
  'deal.resumed',
  'deal.completed',
  'deal.cancelled',
  'dispute.opened',
  'dispute.resolved',
  'brief.changeRequested',
  'brief.changeResolved',
] as const;
export type SystemMessageKey = (typeof SYSTEM_MESSAGE_KEYS)[number];

export const briefChangeRequestSchema = z.object({
  dealId: z.string().min(1),
  description: z
    .string()
    .trim()
    .min(20, 'errors.deal.changeDescriptionTooShort')
    .max(3000),
});

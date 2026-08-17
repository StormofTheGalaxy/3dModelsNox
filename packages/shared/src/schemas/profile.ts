import { z } from 'zod';

import {
  ART_STYLES,
  AVAILABILITY_STATES,
  CURRENCIES,
  CUSTOMER_TYPES,
  SPECIALIZATIONS,
  SPOKEN_LANGUAGES,
} from '../domain/taxonomy';

/**
 * Схемы профилей (§4.2). Сообщения — ключи i18n.
 * Все поля кроме минимально необходимых опциональные: профиль заполняется
 * постепенно, мастер онбординга не должен требовать всё сразу.
 */

const freeTagList = (max: number) =>
  z
    .array(z.string().trim().min(1).max(48))
    .max(max, 'errors.profile.tooManyTags')
    // Пустые строки прилетают из формы, когда пользователь стёр значение.
    .transform((values) => [...new Set(values.filter(Boolean))]);

export const designerProfileSchema = z.object({
  country: z.string().trim().max(64).optional().default(''),
  languages: z.array(z.enum(SPOKEN_LANGUAGES)).max(8).default([]),

  specializations: z
    .array(z.enum(SPECIALIZATIONS))
    .min(1, 'errors.profile.specializationRequired')
    .max(9),
  styles: z.array(z.enum(ART_STYLES)).max(8).default([]),
  software: freeTagList(15).default([]),
  engines: freeTagList(10).default([]),

  hourlyRate: z.number().int().min(0).max(100_000).nullable().default(null),
  minBudget: z.number().int().min(0).max(10_000_000).nullable().default(null),
  currency: z.enum(CURRENCIES).default('USD'),

  availability: z.enum(AVAILABILITY_STATES).default('open'),
  bio: z.string().trim().max(2000, 'errors.profile.bioTooLong').optional().default(''),
});

export type DesignerProfileInput = z.infer<typeof designerProfileSchema>;

export const customerProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'errors.profile.displayNameTooShort')
    .max(64, 'errors.profile.displayNameTooLong'),
  type: z.enum(CUSTOMER_TYPES).default('indie'),
  projectLinks: z
    .array(z.string().trim().url('errors.profile.invalidUrl'))
    .max(5, 'errors.profile.tooManyLinks')
    .default([]),
  bio: z.string().trim().max(2000, 'errors.profile.bioTooLong').optional().default(''),
});

export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;

/** Выбор в мастере онбординга: какие профили создать (§4.1). */
export const onboardingSchema = z.object({
  intent: z.enum(['designer', 'customer', 'both']),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

import { z } from 'zod';

import {
  ART_STYLES,
  ASSET_TYPES,
  REPORT_CATEGORIES,
  REPORT_TARGET_TYPES,
  WORK_VISIBILITIES,
} from '../domain/taxonomy';

/**
 * Схемы портфолио и жалоб (§4.3).
 * Техблок целиком опционален — это осознанное требование ТЗ.
 */

const tagList = (max: number) =>
  z
    .array(z.string().trim().min(1).max(48))
    .max(max)
    .transform((values) => [...new Set(values.filter(Boolean))]);

export const workSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'errors.work.titleTooShort')
    .max(120, 'errors.work.titleTooLong'),
  description: z.string().trim().max(5000, 'errors.work.descriptionTooLong').optional().default(''),

  assetType: z.enum(ASSET_TYPES).nullable().default(null),
  styles: z.array(z.enum(ART_STYLES)).max(6).default([]),
  software: tagList(10).default([]),
  engines: tagList(6).default([]),

  polycount: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  textureInfo: z.string().trim().max(200).optional().default(''),
  formats: tagList(10).default([]),
  timeSpentHours: z.number().int().min(0).max(100_000).nullable().default(null),

  visibility: z.enum(WORK_VISIBILITIES).default('public'),

  /// Идентификаторы уже загруженных медиа в нужном порядке.
  mediaIds: z.array(z.string().min(1)).min(1, 'errors.work.mediaRequired').max(20),
});

export type WorkInput = z.infer<typeof workSchema>;

/** Параметры витрины галереи (§4.3). Всё опционально — это фильтры. */
export const gallerySortOptions = ['new', 'popular_week', 'popular_all'] as const;
export type GallerySort = (typeof gallerySortOptions)[number];

export const galleryQuerySchema = z.object({
  style: z.enum(ART_STYLES).optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  software: z.string().trim().max(48).optional(),
  sort: z.enum(gallerySortOptions).default('new'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(48).default(24),
});

export type GalleryQuery = z.infer<typeof galleryQuerySchema>;

export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1),
  category: z.enum(REPORT_CATEGORIES),
  text: z.string().trim().max(2000).optional().default(''),
});

export type ReportInput = z.infer<typeof reportSchema>;

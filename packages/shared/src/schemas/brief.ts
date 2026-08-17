import { z } from 'zod';

import { ART_STYLES, ASSET_TYPES, CURRENCIES, ENGINE_PRESETS } from '../domain/taxonomy';

/**
 * Схема технического задания (§3, §4.4) — флагманский модуль платформы.
 *
 * Пять секций. Почти всё опционально: конструктор не должен требовать от
 * заказчика полигонажа, если он его не знает. Обязательным ТЗ помечает только
 * то, без чего сделку не провести, — количество раундов правок.
 */

const trimmedString = (max: number) => z.string().trim().max(max);

/** Референс: либо загруженная картинка, либо внешняя ссылка (§3, секция style). */
export const briefReferenceSchema = z.object({
  kind: z.enum(['image', 'link']),
  url: z.string().trim().url('errors.brief.invalidUrl'),
  note: trimmedString(200).optional().default(''),
});

export type BriefReference = z.infer<typeof briefReferenceSchema>;

export const briefGeneralSchema = z.object({
  assetType: z.enum(ASSET_TYPES).nullable().default(null),
  description: trimmedString(5000).default(''),
  /// Сколько единиц ассета нужно: один персонаж или набор из десяти пропсов.
  quantity: z.number().int().min(1).max(10_000).nullable().default(null),
});

export const briefStyleSchema = z.object({
  styleTags: z.array(z.enum(ART_STYLES)).max(6).default([]),
  references: z.array(briefReferenceSchema).max(12).default([]),
  moodboardNote: trimmedString(2000).default(''),
});

export const briefTechSchema = z.object({
  engine: trimmedString(64).default(''),
  platform: z.enum(['pc', 'mobile', 'console', 'vr', 'web', 'any']).nullable().default(null),
  polyBudget: z.number().int().min(0).max(100_000_000).nullable().default(null),
  formats: z.array(trimmedString(24)).max(10).default([]),
  textures: z
    .object({
      resolution: z.enum(['512', '1k', '2k', '4k', '8k']).nullable().default(null),
      pbrSet: z.boolean().default(false),
      note: trimmedString(300).default(''),
    })
    .default({ resolution: null, pbrSet: false, note: '' }),
  rigging: z.enum(['none', 'basic', 'full', 'unknown']).default('unknown'),
  animationsList: z.array(trimmedString(80)).max(30).default([]),
  lods: z.number().int().min(0).max(8).nullable().default(null),
});

export const briefDeliverySchema = z.object({
  deliverables: z.array(trimmedString(120)).max(20).default([]),
  sourcesIncluded: z.boolean().default(true),
  /// Единственное обязательное техполе: без числа раундов спор не разобрать.
  revisionRounds: z
    .number({ invalid_type_error: 'errors.brief.revisionRoundsRequired' })
    .int()
    .min(0, 'errors.brief.revisionRoundsRequired')
    .max(20),
});

export const briefTermsSchema = z.object({
  deadline: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'errors.brief.invalidDate')
    .nullable()
    .default(null),
  /// Бюджет либо число с валютой, либо явное «жду предложений».
  budgetMode: z.enum(['fixed', 'open']).default('open'),
  budgetAmount: z.number().int().min(0).max(100_000_000).nullable().default(null),
  budgetCurrency: z.enum(CURRENCIES).default('USD'),
  extraTerms: trimmedString(2000).default(''),
});

export const briefSectionsSchema = z.object({
  general: briefGeneralSchema,
  style: briefStyleSchema,
  tech: briefTechSchema,
  delivery: briefDeliverySchema,
  terms: briefTermsSchema,
});

export type BriefSections = z.infer<typeof briefSectionsSchema>;

export const BRIEF_SECTION_KEYS = ['general', 'style', 'tech', 'delivery', 'terms'] as const;
export type BriefSectionKey = (typeof BRIEF_SECTION_KEYS)[number];

/** Пустое ТЗ: и конструктор, и ИИ-генерация начинают отсюда. */
export function emptyBriefSections(): BriefSections {
  return briefSectionsSchema.parse({
    general: {},
    style: {},
    tech: { textures: {} },
    delivery: { revisionRounds: 2 },
    terms: {},
  });
}

/**
 * Разбор секций из БД. Схема со временем меняется, а в JSON лежат старые
 * записи — поэтому недостающие поля добираются значениями по умолчанию,
 * а не роняют страницу.
 */
export function parseBriefSections(value: unknown): BriefSections {
  const result = briefSectionsSchema.safeParse(value);
  if (result.success) return result.data;

  const partial = (value ?? {}) as Record<string, unknown>;
  const empty = emptyBriefSections();

  return briefSectionsSchema.parse({
    general: { ...empty.general, ...(partial.general as object) },
    style: { ...empty.style, ...(partial.style as object) },
    tech: { ...empty.tech, ...(partial.tech as object) },
    delivery: { ...empty.delivery, ...(partial.delivery as object) },
    terms: { ...empty.terms, ...(partial.terms as object) },
  });
}

export const briefTitleSchema = z
  .string()
  .trim()
  .min(3, 'errors.brief.titleTooShort')
  .max(140, 'errors.brief.titleTooLong');

export const briefAccessSchema = z.enum(['private', 'link', 'selected', 'public']);
export const briefStatusSchema = z.enum(['draft', 'active', 'frozen', 'archived']);

/** Сохранение конструктора: заголовок + секции целиком. */
export const briefSaveSchema = z.object({
  title: briefTitleSchema,
  sections: briefSectionsSchema,
  comment: trimmedString(200).optional().default(''),
});

export type BriefSaveInput = z.infer<typeof briefSaveSchema>;

/** Свободное описание для «✨ Создать из описания». */
export const briefGenerateSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(20, 'errors.brief.promptTooShort')
    .max(2000, 'errors.brief.promptTooLong'),
});

export const ENGINE_SUGGESTIONS = ENGINE_PRESETS;

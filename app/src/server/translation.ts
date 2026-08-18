import 'server-only';

import { createHash } from 'node:crypto';

import { prisma } from '@polyforge/db';
import type { Locale } from '@polyforge/shared';

import { aiProvider } from './ai/provider';
import { spendCredits } from './ai/credits';

/**
 * Автоперевод контента (§4.7).
 *
 * Заказы, ТЗ и описания работ показываются на языке интерфейса зрителя с
 * пометкой «переведено ИИ» и переключателем «показать оригинал».
 *
 * Перевод кэшируется на объект, а не на пользователя: текст заказа один и тот
 * же для всех читателей, и платить за него кредитами каждому — трата ради
 * ничего. Хэш оригинала ловит правку: изменился текст — перевод пересчитается.
 */

export type TranslatableEntity = 'order' | 'brief' | 'work' | 'response' | 'review';

export interface TranslatedField {
  /** Текст для показа: перевод, если он есть, иначе оригинал. */
  text: string;
  original: string;
  /** true — показан машинный перевод, нужна пометка и переключатель. */
  translated: boolean;
}

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

/**
 * Простая эвристика языка: кириллица против латиницы.
 *
 * Спрашивать модель, на каком языке текст, ради решения «переводить ли» —
 * это лишний вызов на каждый заказ витрины. Двух алфавитов достаточно:
 * платформа двуязычная, RU↔EN.
 */
export function detectLocale(text: string): Locale {
  const cyrillic = (text.match(/[а-яёА-ЯЁ]/gu) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/gu) ?? []).length;
  return cyrillic > latin ? 'ru' : 'en';
}

interface TranslateOptions {
  entity: TranslatableEntity;
  entityId: string;
  field: string;
  text: string;
  targetLocale: Locale;
  /** Кто смотрит: с него списываются кредиты за первый перевод. */
  viewerId?: string;
}

/**
 * Переводит поле объекта с кэшированием.
 *
 * Ошибка перевода не должна ломать страницу: если модель недоступна,
 * возвращается оригинал без пометки — читатель увидит текст как есть.
 */
export async function translateField(options: TranslateOptions): Promise<TranslatedField> {
  const original = options.text?.trim() ?? '';
  const untranslated: TranslatedField = { text: original, original, translated: false };

  if (original.length < 3) return untranslated;
  // Текст уже на языке читателя — переводить нечего.
  if (detectLocale(original) === options.targetLocale) return untranslated;

  const sourceHash = hashOf(original);

  const cached = await prisma.contentTranslation.findUnique({
    where: {
      entity_entityId_field_targetLocale: {
        entity: options.entity,
        entityId: options.entityId,
        field: options.field,
        targetLocale: options.targetLocale,
      },
    },
    select: { text: true, sourceHash: true },
  });

  if (cached && cached.sourceHash === sourceHash) {
    return { text: cached.text, original, translated: true };
  }

  if (options.viewerId) {
    const spend = await spendCredits(options.viewerId, 'content_translate', {
      type: options.entity,
      id: options.entityId,
    });
    // Кредиты кончились — показываем оригинал, а не ошибку на весь экран.
    if (!spend.ok) return untranslated;
  }

  try {
    const provider = await aiProvider();
    const text = await provider.translate(
      { text: original, targetLocale: options.targetLocale },
      { locale: options.targetLocale, userId: options.viewerId },
    );

    await prisma.contentTranslation.upsert({
      where: {
        entity_entityId_field_targetLocale: {
          entity: options.entity,
          entityId: options.entityId,
          field: options.field,
          targetLocale: options.targetLocale,
        },
      },
      create: {
        entity: options.entity,
        entityId: options.entityId,
        field: options.field,
        targetLocale: options.targetLocale,
        text,
        sourceHash,
        requestedById: options.viewerId ?? null,
      },
      update: { text, sourceHash, requestedById: options.viewerId ?? null },
    });

    return { text, original, translated: true };
  } catch (error) {
    console.error('[translation] перевод контента не удался', error);
    return untranslated;
  }
}

/**
 * Перевод нескольких полей одного объекта.
 * Последовательно, а не параллельно: заказ на витрине не стоит десятка
 * одновременных запросов к модели.
 */
export async function translateFields(
  entity: TranslatableEntity,
  entityId: string,
  fields: Record<string, string>,
  targetLocale: Locale,
  viewerId?: string,
): Promise<Record<string, TranslatedField>> {
  const result: Record<string, TranslatedField> = {};

  for (const [field, text] of Object.entries(fields)) {
    result[field] = await translateField({
      entity,
      entityId,
      field,
      text,
      targetLocale,
      viewerId,
    });
  }

  return result;
}

/** Уже посчитанные переводы объекта — без обращения к модели. */
export async function cachedTranslations(
  entity: TranslatableEntity,
  entityId: string,
  targetLocale: Locale,
): Promise<Record<string, string>> {
  const rows = await prisma.contentTranslation.findMany({
    where: { entity, entityId, targetLocale },
    select: { field: true, text: true },
  });

  return Object.fromEntries(rows.map((row) => [row.field, row.text]));
}

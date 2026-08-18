import 'server-only';

import { prisma } from '@polyforge/db';
import type { Locale } from '@polyforge/shared';

import { LEGAL_CONTENT, type LegalDoc } from '@/content/legal';

/**
 * Правовые документы (§4.10).
 *
 * Источник правды — запись в БД: тексты правит юрист через админку, и смена
 * оферты не должна требовать деплоя. Пока записи нет, отдаётся драфт из кода:
 * платформа не может остаться вовсе без пользовательского соглашения, даже
 * на пустой базе.
 */

export interface LegalView {
  title: string | null;
  /** Markdown из админки; `null` — показываем структурированный драфт. */
  markdown: string | null;
  effectiveAt: Date | null;
  sections: { heading: string; paragraphs: string[] }[];
}

export async function getLegalDocument(slug: LegalDoc, locale: Locale): Promise<LegalView> {
  const stored = await prisma.legalDocument.findUnique({
    where: { slug_locale: { slug, locale } },
    select: { title: true, body: true, effectiveAt: true },
  });

  if (stored) {
    return {
      title: stored.title,
      markdown: stored.body,
      effectiveAt: stored.effectiveAt,
      sections: [],
    };
  }

  return {
    title: null,
    markdown: null,
    effectiveAt: null,
    sections: LEGAL_CONTENT[slug][locale],
  };
}

/** Все документы для админки — включая ещё не заведённые. */
export async function listLegalDocuments() {
  return prisma.legalDocument.findMany({
    orderBy: [{ slug: 'asc' }, { locale: 'asc' }],
    select: {
      id: true,
      slug: true,
      locale: true,
      title: true,
      body: true,
      effectiveAt: true,
      updatedAt: true,
      updatedBy: { select: { nickname: true } },
    },
  });
}

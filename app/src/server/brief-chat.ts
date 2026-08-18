import 'server-only';

import { prisma } from '@polyforge/db';
import type { BriefClarification } from '@polyforge/ai';

import { getSetting } from './settings';

/**
 * Чат уточнений по ТЗ (§4.4, post-MVP №3).
 *
 * Диалог живёт рядом с ТЗ и виден только его владельцу: это черновая работа
 * над формулировкой, а не переписка сторон. В сделку он не попадает и в
 * снимок версии тоже — исполнитель читает готовое ТЗ, а не путь к нему.
 */

/** Сколько последних реплик уходит в модель. Дальше контекст не помогает. */
export const HISTORY_TURNS = 12;

export interface BriefChatSuggestion {
  section: string;
  field: string;
  value: string;
  label: string;
}

export interface BriefChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestions: BriefChatSuggestion[];
  appliedFields: string[];
  createdAt: Date;
}

export async function briefChatEnabled(): Promise<boolean> {
  return getSetting('feature_brief_chat');
}

/** Ключ подсказки — по нему кнопка помечается применённой. */
export function suggestionKey(suggestion: { section: string; field: string }): string {
  return `${suggestion.section}.${suggestion.field}`;
}

function parseSuggestions(value: unknown): BriefChatSuggestion[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;

    const section = typeof record.section === 'string' ? record.section : null;
    const field = typeof record.field === 'string' ? record.field : null;
    const text = typeof record.value === 'string' ? record.value : null;
    if (!section || !field || text === null) return [];

    return [
      {
        section,
        field,
        value: text,
        label: typeof record.label === 'string' ? record.label : text,
      },
    ];
  });
}

export async function listBriefChat(briefId: string): Promise<BriefChatTurn[]> {
  const rows = await prisma.briefChatMessage.findMany({
    where: { briefId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      text: true,
      suggestions: true,
      appliedFields: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    suggestions: parseSuggestions(row.suggestions),
    appliedFields: row.appliedFields,
    createdAt: row.createdAt,
  }));
}

/** История для модели: только текст, в порядке появления, хвостом. */
export async function chatHistoryFor(
  briefId: string,
): Promise<{ role: 'assistant' | 'user'; text: string }[]> {
  const rows = await prisma.briefChatMessage.findMany({
    where: { briefId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_TURNS,
    select: { role: true, text: true },
  });

  return rows.reverse().map((row) => ({ role: row.role, text: row.text }));
}

export async function recordTurn(input: {
  briefId: string;
  role: 'user' | 'assistant';
  text: string;
  clarification?: BriefClarification;
}): Promise<BriefChatTurn> {
  const created = await prisma.briefChatMessage.create({
    data: {
      briefId: input.briefId,
      role: input.role,
      text: input.text,
      suggestions: input.clarification?.suggestions ?? undefined,
    },
    select: {
      id: true,
      role: true,
      text: true,
      suggestions: true,
      appliedFields: true,
      createdAt: true,
    },
  });

  return {
    id: created.id,
    role: created.role,
    text: created.text,
    suggestions: parseSuggestions(created.suggestions),
    appliedFields: created.appliedFields,
    createdAt: created.createdAt,
  };
}

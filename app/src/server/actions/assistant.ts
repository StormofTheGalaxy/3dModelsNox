'use server';

import { getTranslations } from 'next-intl/server';

import { AIError } from '@polyforge/ai';

import { aiProvider } from '../ai/provider';
import {
  actionsForScope,
  assistantEnabled,
  ASSISTANT_TOPICS,
  resolveHref,
  type AssistantScope,
} from '../assistant';
import { getBalances } from '../ai/credits';
import { spendCredits } from '../ai/credits';
import { getCurrentUser } from '../auth/session';
import { checkRateLimit } from '../ratelimit';

/**
 * Единый ИИ-ассистент (post-MVP №10).
 *
 * Модель выбирает одно из готовых действий или одну из написанных
 * платформой справок — и всё. Ни выполнять действия за человека, ни
 * сочинять ответы про правила платформы она не может: тексты справок
 * лежат в словарях, а действие — это ссылка на кнопку, которую человек
 * нажмёт сам.
 */

export interface AssistantAnswer {
  kind: 'action' | 'topic' | 'unknown';
  /** Ключ действия и куда вести. */
  action?: { key: string; href: string; icon: string };
  /** Ключ справки — текст берётся из словаря на клиенте. */
  topic?: string;
  reason: string;
  left: number;
}

export async function askAssistant(
  question: string,
  scope: string,
  entityId: string | null,
): Promise<
  { ok: true; answer: AssistantAnswer } | { ok: false; error: string; values?: Record<string, string | number> }
> {
  if (!(await assistantEnabled())) return { ok: false, error: 'errors.assistant.disabled' };

  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  const text = question.trim().slice(0, 500);
  if (text.length < 3) return { ok: false, error: 'errors.assistant.tooShort' };

  const limit = await checkRateLimit('ai', user.id);
  if (!limit.allowed) {
    return { ok: false, error: 'errors.rateLimited', values: { seconds: limit.retryAfterSeconds } };
  }

  const actions = actionsForScope(scope as AssistantScope);

  const spend = await spendCredits(user.id, 'assistant');
  if (!spend.ok) return { ok: false, error: spend.error, values: { left: spend.left } };

  // Подписи берём из словаря спрашивающего: модель сопоставляет слова
  // вопроса со словами того же языка, иначе русский вопрос не найдёт
  // английское описание и наоборот.
  const t = await getTranslations({ locale: user.locale, namespace: 'assistant' });

  try {
    const provider = await aiProvider();
    const route = await provider.routeAssistant(
      {
        question: text,
        actions: actions.map((action) => ({
          key: action.key,
          label: t(`actions.${action.key}.label`),
          description: t(`actions.${action.key}.description`),
        })),
        topics: ASSISTANT_TOPICS.map((topic) => ({
          key: topic,
          label: `${t(`topics.${topic}.title`)}. ${t(`topics.${topic}.body`)}`,
        })),
      },
      { locale: user.locale, userId: user.id },
    );

    if (route.kind === 'action' && route.action) {
      const action = actions.find((item) => item.key === route.action);

      if (action) {
        return {
          ok: true,
          answer: {
            kind: 'action',
            action: {
              key: action.key,
              href: resolveHref(action, entityId),
              icon: action.icon,
            },
            reason: route.reason,
            left: spend.left,
          },
        };
      }
    }

    if (route.kind === 'topic' && route.topic) {
      return {
        ok: true,
        answer: { kind: 'topic', topic: route.topic, reason: route.reason, left: spend.left },
      };
    }

    return { ok: true, answer: { kind: 'unknown', reason: route.reason, left: spend.left } };
  } catch (error) {
    if (error instanceof AIError) return { ok: false, error: error.userMessageKey };

    console.error('[assistant] неожиданная ошибка', error);
    return { ok: false, error: 'errors.ai.failed' };
  }
}

/** Остаток кредитов для панели — она показывает его до первого вопроса. */
export async function assistantBalance(): Promise<{ left: number } | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const balances = await getBalances(user.id);
  const general = balances.find((balance) => balance.pool === 'general_pool');

  return { left: general?.left ?? 0 };
}

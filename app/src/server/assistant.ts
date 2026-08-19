import 'server-only';

import { getSetting } from './settings';

/**
 * Единый ИИ-ассистент (post-MVP №10).
 *
 * К этому моменту у платформы двенадцать ИИ-возможностей, и каждая живёт
 * своей кнопкой «✨» на своём экране. Человек, которому нужна помощь,
 * должен сперва угадать, на каком экране она лежит.
 *
 * Ассистент — маршрутизатор поверх уже существующего, а не тринадцатая
 * возможность. Он ничего не умеет сам: приводит к нужной кнопке или к
 * заранее написанной справке. Из этого следует главное свойство —
 * соврать в фактах о платформе ему негде, потому что тексты справок наши,
 * а модель только выбирает из списка.
 */

export async function assistantEnabled(): Promise<boolean> {
  return getSetting('feature_ai_assistant');
}

/** Где человек находится — от этого зависит, что предложить. */
export type AssistantScope =
  | 'brief'
  | 'order'
  | 'deal'
  | 'response'
  | 'profile'
  | 'general';

export interface AssistantAction {
  key: string;
  /** Куда вести. Путь без языкового префикса; :id подставляется зовущим. */
  href: string;
  /** На каких экранах предлагать. */
  scopes: AssistantScope[];
  icon: string;
}

/**
 * Каталог возможностей.
 *
 * Ассистент не вызывает их за человека и не тратит его кредиты втайне: он
 * доводит до кнопки, а решение нажать остаётся за человеком. Это же
 * избавляет от целого класса вопросов «почему списались кредиты, я ничего
 * не нажимал».
 */
export const ASSISTANT_ACTIONS: AssistantAction[] = [
  {
    key: 'brief_create',
    href: '/briefs/new',
    scopes: ['general', 'brief', 'order', 'profile'],
    icon: 'FilePlus2',
  },
  {
    key: 'brief_generate',
    href: '/briefs/new',
    scopes: ['general', 'brief'],
    icon: 'Sparkles',
  },
  { key: 'brief_review', href: '/briefs/:id/edit', scopes: ['brief'], icon: 'ShieldCheck' },
  { key: 'brief_estimate', href: '/briefs/:id/edit', scopes: ['brief'], icon: 'Calculator' },
  { key: 'brief_clarify', href: '/briefs/:id/edit', scopes: ['brief'], icon: 'MessagesSquare' },
  { key: 'order_publish', href: '/orders/new', scopes: ['brief', 'order', 'general'], icon: 'Send' },
  { key: 'order_match', href: '/orders/:id', scopes: ['order'], icon: 'Users' },
  { key: 'order_responses', href: '/orders/:id/responses', scopes: ['order'], icon: 'Inbox' },
  { key: 'deal_summary', href: '/deals/:id', scopes: ['deal'], icon: 'ScrollText' },
  { key: 'response_improve', href: '/orders/:id', scopes: ['response', 'order'], icon: 'Wand2' },
  { key: 'profile_fill', href: '/settings', scopes: ['profile', 'general'], icon: 'UserPen' },
  { key: 'credits', href: '/settings', scopes: ['general', 'brief', 'order', 'deal', 'profile'], icon: 'Coins' },
];

/**
 * Темы справки.
 *
 * Тексты написаны платформой и лежат в словарях: ассистент показывает их
 * дословно. Пересказывать своими словами правила расчётов и споров модели
 * нельзя — ошибка здесь стоит человеку денег.
 */
export const ASSISTANT_TOPICS = [
  'payments',
  'deal_flow',
  'disputes',
  'levels',
  'credits',
  'invites',
  'verification',
  'translation',
] as const;

export type AssistantTopic = (typeof ASSISTANT_TOPICS)[number];

export function actionsForScope(scope: AssistantScope): AssistantAction[] {
  return ASSISTANT_ACTIONS.filter((action) => action.scopes.includes(scope));
}

/** Путь действия с подставленным идентификатором текущей страницы. */
export function resolveHref(action: AssistantAction, entityId: string | null): string {
  if (!action.href.includes(':id')) return action.href;
  // Идентификатора нет — вести по шаблонному пути некуда, отправляем в раздел.
  if (!entityId) return action.href.replace(/\/:id.*$/u, '');
  return action.href.replace(':id', entityId);
}

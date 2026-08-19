import { z } from 'zod';

import {
  ART_STYLES,
  ASSET_TYPES,
  briefSectionsSchema,
  type BriefSections,
  type Locale,
} from '@polyforge/shared';

/**
 * Слой абстракции над провайдером ИИ (§2.1).
 *
 * Интерфейс перечислен в ТЗ целиком, поэтому объявлен целиком: модули фаз 3–6
 * (перевод чата, саммари споров, парсинг портфолио) подключатся к готовому
 * контракту, а не будут переписывать его под себя.
 */

export interface AIContext {
  /** Язык пользователя: ответы модели должны приходить на нём. */
  locale: Locale;
  /** Кто инициировал вызов — уходит в логи провайдера. */
  userId?: string;
}

// ── Генерация ТЗ из свободного описания ─────────────────────────────────────

export const generatedBriefSchema = z.object({
  title: z.string().trim().min(3).max(140),
  sections: briefSectionsSchema,
});

export type GeneratedBrief = z.infer<typeof generatedBriefSchema>;

export interface GenerateBriefInput {
  prompt: string;
}

// ── Проверка ТЗ ─────────────────────────────────────────────────────────────

export const briefIssueSchema = z.object({
  /** Секция и поле, к которым относится замечание: UI ставит кнопку «исправить». */
  section: z.enum(['general', 'style', 'tech', 'delivery', 'terms']),
  field: z.string().trim().max(64).optional(),
  severity: z.enum(['gap', 'conflict', 'hint']),
  message: z.string().trim().min(3).max(400),
  /** Предлагаемое значение поля, если модель может его предложить. */
  suggestion: z.string().trim().max(200).optional(),
});

export const briefReviewSchema = z.object({
  /** Субъективная готовность ТЗ в процентах — ориентир для заказчика. */
  score: z.number().int().min(0).max(100),
  issues: z.array(briefIssueSchema).max(20),
  summary: z.string().trim().max(600),
});

export type BriefIssue = z.infer<typeof briefIssueSchema>;
export type BriefReview = z.infer<typeof briefReviewSchema>;

export interface ReviewBriefInput {
  title: string;
  sections: BriefSections;
}

// ── Оценка бюджета и сроков ─────────────────────────────────────────────────

export const briefEstimateSchema = z.object({
  budgetMin: z.number().int().min(0),
  budgetMax: z.number().int().min(0),
  currency: z.string().trim().min(3).max(3),
  daysMin: z.number().int().min(1).max(365),
  daysMax: z.number().int().min(1).max(365),
  rationale: z.string().trim().max(600),
});

export type BriefEstimate = z.infer<typeof briefEstimateSchema>;

export interface EstimateBudgetInput {
  title: string;
  sections: BriefSections;
  currency: string;
}

// ── Подсказка для конкретного поля ──────────────────────────────────────────

export const fieldSuggestionSchema = z.object({
  value: z.string().trim().max(200),
  explanation: z.string().trim().max(400),
});

export type FieldSuggestion = z.infer<typeof fieldSuggestionSchema>;

export interface SuggestFieldInput {
  section: string;
  field: string;
  title: string;
  sections: BriefSections;
}

// ── Чат уточнений по ТЗ (post-MVP №3) ───────────────────────────────────────

export const briefClarificationSchema = z.object({
  /**
   * Реплика модели: один вопрос за ход. Список из пяти вопросов человек
   * пролистывает не отвечая, а на один отвечает.
   */
  message: z.string().trim().min(3).max(800),
  /** Конкретные значения полей, которые модель предлагает подставить. */
  suggestions: z
    .array(
      z.object({
        section: z.enum(['general', 'style', 'tech', 'delivery', 'terms']),
        field: z.string().trim().max(64),
        value: z.string().trim().max(200),
        /** Что именно подставится — показывается на кнопке. */
        label: z.string().trim().max(120),
      }),
    )
    .max(4)
    .default([]),
  /** Пробелов не осталось — чат предлагает закончить. */
  done: z.boolean().default(false),
});

export type BriefClarification = z.infer<typeof briefClarificationSchema>;

export interface ClarifyBriefInput {
  title: string;
  sections: BriefSections;
  /** История в порядке появления: чем отвечал человек и что спрашивала модель. */
  history: { role: 'assistant' | 'user'; text: string }[];
  /** Последняя реплика пользователя; пусто — значит чат только открыли. */
  answer: string;
}

// ── Подбор исполнителей (post-MVP №4) ───────────────────────────────────────

export const matchRankingSchema = z.object({
  items: z
    .array(
      z.object({
        /** Идентификатор кандидата из переданного списка. */
        id: z.string().trim().min(1).max(64),
        /** Насколько кандидат подходит: 0..100. */
        score: z.number().int().min(0).max(100),
        /** Одна фраза «почему именно он» — показывается заказчику. */
        reason: z.string().trim().min(3).max(300),
      }),
    )
    .max(20),
});

export type MatchRanking = z.infer<typeof matchRankingSchema>;

/** Кандидат для ранжирования. Собирается запросом, а не моделью. */
export interface MatchCandidate {
  id: string;
  nickname: string;
  level: string;
  rating: number;
  ratingCount: number;
  ordersCompleted: number;
  onTimePct: number | null;
  specializations: string[];
  styles: string[];
  engines: string[];
  software: string[];
  minBudget: number | null;
  currency: string;
  bio: string;
}

export interface RankMatchesInput {
  /** Чего хочет заказчик: заголовок и ключевые требования заказа. */
  title: string;
  sections: BriefSections;
  budgetAmount: number | null;
  currency: string;
  /** Кандидаты, уже отобранные по тегам. Модель их только упорядочивает. */
  candidates: MatchCandidate[];
}

// ── Текстовые операции (фазы 3 и 6) ─────────────────────────────────────────

export interface TranslateInput {
  text: string;
  targetLocale: Locale;
}

export interface ImproveTextInput {
  text: string;
  /** Что за текст правим: отклик, описание работы, био. */
  kind: 'response' | 'work_description' | 'bio';
}

export interface SummarizeInput {
  /** Реплики в порядке появления. */
  messages: { author: string; text: string }[];
}

// ── Единый ИИ-ассистент (post-MVP №10) ──────────────────────────────────────

/**
 * Ассистент — маршрутизатор, а не вторая голова.
 *
 * Он не отвечает от себя: выбирает одно из уже существующих действий
 * платформы либо одну из заранее написанных справок. Поэтому модель
 * возвращает не текст, а выбор — и соврать в фактах ей негде.
 */
export const assistantRouteSchema = z.object({
  /** Что делать: запустить действие, показать справку или признаться, что не понял. */
  kind: z.enum(['action', 'topic', 'unknown']),
  /** Ключ действия из переданного списка возможностей. */
  action: z.string().trim().max(64).optional(),
  /** Ключ справки из переданного списка тем. */
  topic: z.string().trim().max(64).optional(),
  /** Короткое пояснение выбора на языке пользователя. */
  reason: z.string().trim().max(300).default(''),
});

export type AssistantRoute = z.infer<typeof assistantRouteSchema>;

export interface AssistantRouteInput {
  /** Что человек написал своими словами. */
  question: string;
  /** Что доступно на текущем экране: ключ и краткое описание. */
  actions: { key: string; label: string; description: string }[];
  /** Темы справки: ключ и о чём она. */
  topics: { key: string; label: string }[];
}

// ── Разбор страницы портфолио (фаза 6) ──────────────────────────────────────

export const parsedProfileSchema = z.object({
  specializations: z.array(z.enum(ASSET_TYPES)).max(9).default([]),
  styles: z.array(z.enum(ART_STYLES)).max(8).default([]),
  software: z.array(z.string().trim().max(48)).max(15).default([]),
  engines: z.array(z.string().trim().max(48)).max(10).default([]),
  bio: z.string().trim().max(2000).default(''),
});

export type ParsedProfile = z.infer<typeof parsedProfileSchema>;

// ── Контракт провайдера ─────────────────────────────────────────────────────

export interface AIProvider {
  /** Имя реализации — попадает в журнал списаний и в админку. */
  readonly name: string;
  /** Работает ли провайдер на настоящей модели или это заглушка разработки. */
  readonly isLive: boolean;

  generateBrief(input: GenerateBriefInput, context: AIContext): Promise<GeneratedBrief>;
  reviewBrief(input: ReviewBriefInput, context: AIContext): Promise<BriefReview>;
  estimateBudget(input: EstimateBudgetInput, context: AIContext): Promise<BriefEstimate>;
  suggestField(input: SuggestFieldInput, context: AIContext): Promise<FieldSuggestion>;
  clarifyBrief(input: ClarifyBriefInput, context: AIContext): Promise<BriefClarification>;
  rankMatches(input: RankMatchesInput, context: AIContext): Promise<MatchRanking>;

  translate(input: TranslateInput, context: AIContext): Promise<string>;
  improveText(input: ImproveTextInput, context: AIContext): Promise<string>;
  summarizeChat(input: SummarizeInput, context: AIContext): Promise<string>;
  summarizeDispute(input: SummarizeInput, context: AIContext): Promise<string>;
  parsePortfolioProfile(input: { text: string }, context: AIContext): Promise<ParsedProfile>;

  routeAssistant(input: AssistantRouteInput, context: AIContext): Promise<AssistantRoute>;
}

export class AIError extends Error {
  constructor(
    message: string,
    /** Ключ i18n для показа пользователю. */
    readonly userMessageKey: string = 'errors.ai.failed',
  ) {
    super(message);
    this.name = 'AIError';
  }
}

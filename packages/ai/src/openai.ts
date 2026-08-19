import type { z } from 'zod';

import { parseBriefSections } from '@polyforge/shared';

import {
  assistantRouteSchema,
  briefClarificationSchema,
  briefEstimateSchema,
  matchRankingSchema,
  briefReviewSchema,
  fieldSuggestionSchema,
  generatedBriefSchema,
  parsedProfileSchema,
  AIError,
  type AIContext,
  type AIProvider,
  type AssistantRoute,
  type AssistantRouteInput,
  type BriefClarification,
  type BriefEstimate,
  type BriefReview,
  type ClarifyBriefInput,
  type MatchRanking,
  type RankMatchesInput,
  type EstimateBudgetInput,
  type FieldSuggestion,
  type GenerateBriefInput,
  type GeneratedBrief,
  type ImproveTextInput,
  type ParsedProfile,
  type ReviewBriefInput,
  type SuggestFieldInput,
  type SummarizeInput,
  type TranslateInput,
} from './types';
import {
  estimateBudgetPrompt,
  generateBriefPrompt,
  improveTextPrompt,
  parseProfilePrompt,
  clarifyBriefPrompt,
  assistantRoutePrompt,
  rankMatchesPrompt,
  reviewBriefPrompt,
  suggestFieldPrompt,
  summarizePrompt,
  translatePrompt,
} from './prompts';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  /** Сильная модель: генерация ТЗ, разбор споров. */
  strongModel: string;
  /** Дешёвая модель: перевод и мелкие правки. */
  cheapModel: string;
  timeoutMs?: number;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * Реализация поверх OpenAI Chat Completions.
 *
 * SDK не используется: нужен один эндпоинт, а прямой fetch не тянет
 * зависимость и не ломается при мажорных обновлениях библиотеки.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly isLive = true;

  constructor(private readonly config: OpenAIConfig) {}

  private async complete(
    messages: ChatMessage[],
    options: { model: string; json: boolean; maxTokens?: number },
  ): Promise<string> {
    let response: Response;

    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          temperature: 0.3,
          max_tokens: options.maxTokens ?? 2000,
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
      });
    } catch (error) {
      throw new AIError(`Сеть недоступна: ${String(error)}`, 'errors.ai.unavailable');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // 429 и 5xx имеет смысл повторить, остальное — ошибка запроса.
      const key = response.status === 429 ? 'errors.ai.rateLimited' : 'errors.ai.failed';
      throw new AIError(`OpenAI ${response.status}: ${body.slice(0, 500)}`, key);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIError('Пустой ответ модели');
    }

    return content;
  }

  /**
   * Разбор JSON-ответа: модель иногда оборачивает его в ```json.
   * Дженерик по самой схеме, а не по её выходному типу: у схем с `.default()`
   * вход и выход различаются, и `ZodType<T>` их не разводит.
   */
  private parseJson<S extends z.ZodTypeAny>(raw: string, schema: S): z.infer<S> {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/u, '')
      .replace(/\s*```$/u, '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new AIError(`Ответ модели не является JSON: ${cleaned.slice(0, 200)}`);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new AIError(`Ответ модели не прошёл валидацию: ${result.error.message.slice(0, 300)}`);
    }

    return result.data;
  }

  private system(): ChatMessage {
    return {
      role: 'system',
      content:
        'Ты помощник платформы PolyForge. Отвечай строго в запрошенном формате, без пояснений вне его.',
    };
  }

  async generateBrief(input: GenerateBriefInput, context: AIContext): Promise<GeneratedBrief> {
    const raw = await this.complete(
      [this.system(), { role: 'user', content: generateBriefPrompt(input.prompt, context.locale) }],
      { model: this.config.strongModel, json: true, maxTokens: 2500 },
    );

    const parsed = this.parseJson(raw, generatedBriefSchema.partial({ sections: true }));

    // Модель могла пропустить часть полей — добираем их значениями по умолчанию,
    // вместо того чтобы отдавать пользователю ошибку валидации.
    return {
      title: parsed.title,
      sections: parseBriefSections(parsed.sections),
    };
  }

  async reviewBrief(input: ReviewBriefInput, context: AIContext): Promise<BriefReview> {
    const raw = await this.complete(
      [
        this.system(),
        { role: 'user', content: reviewBriefPrompt(input.title, input.sections, context.locale) },
      ],
      { model: this.config.strongModel, json: true },
    );

    return this.parseJson(raw, briefReviewSchema);
  }

  async clarifyBrief(input: ClarifyBriefInput, context: AIContext): Promise<BriefClarification> {
    const raw = await this.complete(
      [
        this.system(),
        {
          role: 'user',
          content: clarifyBriefPrompt(
            input.title,
            input.sections,
            input.history,
            input.answer,
            context.locale,
          ),
        },
      ],
      // Дешёвая модель: это диалог из коротких реплик, а не разбор спора.
      { model: this.config.cheapModel, json: true, maxTokens: 700 },
    );

    return this.parseJson(raw, briefClarificationSchema);
  }

  async rankMatches(input: RankMatchesInput, context: AIContext): Promise<MatchRanking> {
    const raw = await this.complete(
      [
        this.system(),
        {
          role: 'user',
          content: rankMatchesPrompt(
            input.title,
            input.sections,
            { amount: input.budgetAmount, currency: input.currency },
            input.candidates,
            context.locale,
          ),
        },
      ],
      { model: this.config.strongModel, json: true, maxTokens: 1500 },
    );

    const ranking = await this.parseJson(raw, matchRankingSchema);

    // Модель может вернуть выдуманный id или потерять кандидата. Список
    // кандидатов — наш, поэтому и правда о нём наша: чужое отбрасываем,
    // забытых дописываем в конец.
    const known = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
    const seen = new Set<string>();

    const items = ranking.items.filter((item) => {
      if (!known.has(item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    for (const candidate of input.candidates) {
      if (!seen.has(candidate.id)) {
        items.push({ id: candidate.id, score: 0, reason: '' });
      }
    }

    return { items };
  }

  async estimateBudget(input: EstimateBudgetInput, context: AIContext): Promise<BriefEstimate> {
    const raw = await this.complete(
      [
        this.system(),
        {
          role: 'user',
          content: estimateBudgetPrompt(
            input.title,
            input.sections,
            input.currency,
            context.locale,
          ),
        },
      ],
      { model: this.config.strongModel, json: true, maxTokens: 800 },
    );

    return this.parseJson(raw, briefEstimateSchema);
  }

  async suggestField(input: SuggestFieldInput, context: AIContext): Promise<FieldSuggestion> {
    const raw = await this.complete(
      [
        this.system(),
        {
          role: 'user',
          content: suggestFieldPrompt(
            input.section,
            input.field,
            input.title,
            input.sections,
            context.locale,
          ),
        },
      ],
      { model: this.config.cheapModel, json: true, maxTokens: 400 },
    );

    return this.parseJson(raw, fieldSuggestionSchema);
  }

  async translate(input: TranslateInput, _context: AIContext): Promise<string> {
    return (
      await this.complete(
        [{ role: 'user', content: translatePrompt(input.text, input.targetLocale) }],
        { model: this.config.cheapModel, json: false, maxTokens: 1500 },
      )
    ).trim();
  }

  async improveText(input: ImproveTextInput, context: AIContext): Promise<string> {
    return (
      await this.complete(
        [{ role: 'user', content: improveTextPrompt(input.text, input.kind, context.locale) }],
        { model: this.config.cheapModel, json: false, maxTokens: 1500 },
      )
    ).trim();
  }

  async summarizeChat(input: SummarizeInput, context: AIContext): Promise<string> {
    return (
      await this.complete(
        [{ role: 'user', content: summarizePrompt(input.messages, 'chat', context.locale) }],
        { model: this.config.cheapModel, json: false, maxTokens: 1200 },
      )
    ).trim();
  }

  async summarizeDispute(input: SummarizeInput, context: AIContext): Promise<string> {
    return (
      await this.complete(
        [{ role: 'user', content: summarizePrompt(input.messages, 'dispute', context.locale) }],
        // Разбор спора идёт на сильной модели: цена ошибки здесь высокая.
        { model: this.config.strongModel, json: false, maxTokens: 1500 },
      )
    ).trim();
  }

  async parsePortfolioProfile(
    input: { text: string },
    context: AIContext,
  ): Promise<ParsedProfile> {
    const raw = await this.complete(
      [this.system(), { role: 'user', content: parseProfilePrompt(input.text, context.locale) }],
      { model: this.config.cheapModel, json: true, maxTokens: 1000 },
    );

    return this.parseJson(raw, parsedProfileSchema);
  }
  async routeAssistant(
    input: AssistantRouteInput,
    context: AIContext,
  ): Promise<AssistantRoute> {
    const raw = await this.complete(
      [
        this.system(),
        {
          role: 'user',
          content: assistantRoutePrompt(input.question, input.actions, input.topics, context.locale),
        },
      ],
      // Дешёвая модель: здесь не рассуждение, а выбор из десятка вариантов.
      { model: this.config.cheapModel, json: true, maxTokens: 300 },
    );

    const route = await this.parseJson(raw, assistantRouteSchema);

    // Ключи — наши, поэтому и проверка наша: выдуманный ключ превращается в
    // «не понял», а не в переход неизвестно куда.
    const actionKeys = new Set(input.actions.map((action) => action.key));
    const topicKeys = new Set(input.topics.map((topic) => topic.key));

    if (route.kind === 'action' && (!route.action || !actionKeys.has(route.action))) {
      return { kind: 'unknown', reason: route.reason };
    }
    if (route.kind === 'topic' && (!route.topic || !topicKeys.has(route.topic))) {
      return { kind: 'unknown', reason: route.reason };
    }

    return route;
  }

}

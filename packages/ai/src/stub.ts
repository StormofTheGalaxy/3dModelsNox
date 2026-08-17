import { emptyBriefSections, type BriefSections, type Locale } from '@polyforge/shared';

import type {
  AIContext,
  AIProvider,
  BriefEstimate,
  BriefIssue,
  BriefReview,
  EstimateBudgetInput,
  FieldSuggestion,
  GenerateBriefInput,
  GeneratedBrief,
  ImproveTextInput,
  ParsedProfile,
  ReviewBriefInput,
  SuggestFieldInput,
  SummarizeInput,
  TranslateInput,
} from './types';

/**
 * Детерминированная заглушка провайдера — для локальной разработки и CI,
 * где ключа OpenAI нет и быть не должно.
 *
 * Это НЕ модель: результат собирается правилами по ключевым словам. Смысл
 * заглушки в том, чтобы весь путь фичи (списание кредитов, запись версии,
 * отрисовка результата) работал и проверялся без внешнего вызова. В проде
 * при заданном ключе всегда работает OpenAIProvider.
 */

const KEYWORDS = {
  assetType: [
    { match: /персонаж|character|орк|герой|npc|человек/iu, value: 'character' as const },
    { match: /оружие|weapon|меч|винтовк|пистолет|топор/iu, value: 'weapon' as const },
    { match: /транспорт|машин|vehicle|танк|корабл|самол/iu, value: 'vehicle' as const },
    { match: /здани|дом|building|башн|замок/iu, value: 'building' as const },
    { match: /окружени|environment|локаци|уровен/iu, value: 'environment' as const },
    { match: /пропс|prop|предмет|мебель|бочк/iu, value: 'prop' as const },
    { match: /анимац|animation|скелет|ригг/iu, value: 'animation' as const },
    { match: /текстур|texture|ретекстур/iu, value: 'texture' as const },
  ],
  platform: [
    { match: /мобил|mobile|android|ios|телефон/iu, value: 'mobile' as const },
    { match: /консол|console|ps5|xbox/iu, value: 'console' as const },
    { match: /\bvr\b|виртуальн/iu, value: 'vr' as const },
    { match: /браузер|web|webgl/iu, value: 'web' as const },
    { match: /\bпк\b|\bpc\b|steam|десктоп/iu, value: 'pc' as const },
  ],
  style: [
    { match: /реализм|realis|фотореал/iu, value: 'realism' as const },
    { match: /лоуполи|low ?poly|низкополигон/iu, value: 'lowpoly' as const },
    { match: /стилиз|stylized|мультяш|wow|blizzard/iu, value: 'stylized' as const },
    { match: /пиксел|pixel|воксел/iu, value: 'pixel' as const },
    { match: /аниме|anime|манга/iu, value: 'anime' as const },
    { match: /sci-?fi|фантаст|космос|киберпанк/iu, value: 'scifi' as const },
    { match: /фэнтези|fantasy|магия|эльф/iu, value: 'fantasy' as const },
  ],
  engine: [
    { match: /unreal|ue5|ue4/iu, value: 'Unreal Engine' },
    { match: /unity/iu, value: 'Unity' },
    { match: /godot/iu, value: 'Godot' },
    { match: /arma|enfusion/iu, value: 'Enfusion (Arma)' },
  ],
} as const;

function firstMatch<T>(text: string, rules: readonly { match: RegExp; value: T }[]): T | null {
  for (const rule of rules) {
    if (rule.match.test(text)) return rule.value;
  }
  return null;
}

/** Типовые лимиты полигонажа по платформе — то, что модель знала бы и так. */
const POLY_BUDGET: Record<string, number> = {
  mobile: 8_000,
  web: 12_000,
  vr: 20_000,
  pc: 60_000,
  console: 80_000,
  any: 30_000,
};

export class StubAIProvider implements AIProvider {
  readonly name = 'stub';
  readonly isLive = false;

  async generateBrief(input: GenerateBriefInput, context: AIContext): Promise<GeneratedBrief> {
    const text = input.prompt;
    const sections = emptyBriefSections();

    const assetType = firstMatch(text, KEYWORDS.assetType);
    const platform = firstMatch(text, KEYWORDS.platform);
    const style = firstMatch(text, KEYWORDS.style);
    const engine = firstMatch(text, KEYWORDS.engine);

    sections.general.assetType = assetType;
    sections.general.description = text.slice(0, 5000);

    if (style) sections.style.styleTags = [style];

    sections.tech.platform = platform;
    sections.tech.engine = engine ?? '';
    sections.tech.polyBudget = POLY_BUDGET[platform ?? 'any'] ?? null;
    sections.tech.formats = engine === 'Unreal Engine' ? ['FBX'] : ['FBX', 'OBJ'];
    sections.tech.textures = {
      resolution: platform === 'mobile' ? '1k' : '2k',
      pbrSet: true,
      note: '',
    };
    sections.tech.rigging = assetType === 'character' ? 'basic' : 'none';

    sections.delivery.deliverables =
      context.locale === 'ru'
        ? ['Модель в согласованном формате', 'Комплект текстур', 'Превью-рендеры']
        : ['Model in the agreed format', 'Texture set', 'Preview renders'];
    sections.delivery.revisionRounds = 2;

    const title = buildTitle(text, context.locale);

    return { title, sections };
  }

  async reviewBrief(input: ReviewBriefInput, context: AIContext): Promise<BriefReview> {
    const issues: BriefIssue[] = [];
    const ru = context.locale === 'ru';
    const { sections } = input;

    if (!sections.general.assetType) {
      issues.push({
        section: 'general',
        field: 'assetType',
        severity: 'gap',
        message: ru ? 'Не указан тип ассета.' : 'Asset type is not specified.',
      });
    }

    if (sections.general.description.trim().length < 40) {
      issues.push({
        section: 'general',
        field: 'description',
        severity: 'gap',
        message: ru
          ? 'Описание слишком короткое — исполнителю не хватит контекста.'
          : 'The description is too short for a contractor to work from.',
      });
    }

    if (sections.style.styleTags.length === 0 && sections.style.references.length === 0) {
      issues.push({
        section: 'style',
        field: 'references',
        severity: 'gap',
        message: ru
          ? 'Нет ни стиля, ни референсов: результат почти наверняка не совпадёт с ожиданием.'
          : 'Neither style nor references are set: the result will almost certainly miss expectations.',
      });
    }

    if (sections.tech.polyBudget === null) {
      issues.push({
        section: 'tech',
        field: 'polyBudget',
        severity: 'gap',
        message: ru ? 'Не указан полигонаж.' : 'Poly budget is not specified.',
        suggestion: String(POLY_BUDGET[sections.tech.platform ?? 'any'] ?? 30_000),
      });
    }

    // Противоречие, которое ТЗ приводит как пример: тяжёлая модель под мобилки.
    if (
      sections.tech.platform === 'mobile' &&
      sections.tech.polyBudget !== null &&
      sections.tech.polyBudget > 30_000
    ) {
      issues.push({
        section: 'tech',
        field: 'polyBudget',
        severity: 'conflict',
        message: ru
          ? 'Полигонаж не соответствует мобильной платформе — это в разы больше типичного бюджета.'
          : 'The poly budget does not match a mobile platform — it is several times the usual limit.',
        suggestion: '8000',
      });
    }

    if (sections.tech.formats.length === 0) {
      issues.push({
        section: 'tech',
        field: 'formats',
        severity: 'gap',
        message: ru ? 'Не указан формат поставки модели.' : 'Delivery format is not specified.',
        suggestion: 'FBX',
      });
    }

    if (!sections.tech.textures.resolution) {
      issues.push({
        section: 'tech',
        field: 'textures',
        severity: 'gap',
        message: ru ? 'Не указано разрешение текстур.' : 'Texture resolution is not specified.',
        suggestion: sections.tech.platform === 'mobile' ? '1k' : '2k',
      });
    }

    if (sections.delivery.deliverables.length === 0) {
      issues.push({
        section: 'delivery',
        field: 'deliverables',
        severity: 'gap',
        message: ru ? 'Не перечислено, что входит в сдачу.' : 'The deliverables list is empty.',
      });
    }

    if (sections.terms.budgetMode === 'fixed' && !sections.terms.budgetAmount) {
      issues.push({
        section: 'terms',
        field: 'budgetAmount',
        severity: 'conflict',
        message: ru
          ? 'Выбран фиксированный бюджет, но сумма не указана.'
          : 'A fixed budget is selected but no amount is set.',
      });
    }

    const score = Math.max(0, 100 - issues.length * 12);

    return {
      score,
      issues,
      summary: ru
        ? `Найдено замечаний: ${issues.length}. Готовность ТЗ примерно ${score}%.`
        : `Issues found: ${issues.length}. The brief is roughly ${score}% ready.`,
    };
  }

  async estimateBudget(input: EstimateBudgetInput, context: AIContext): Promise<BriefEstimate> {
    const { sections } = input;
    const ru = context.locale === 'ru';

    // Оценка из объёма работ: база по типу ассета плюс надбавки.
    let days = 3;
    if (sections.general.assetType === 'character') days += 4;
    if (sections.general.assetType === 'environment') days += 5;
    if (sections.tech.rigging === 'basic') days += 2;
    if (sections.tech.rigging === 'full') days += 5;
    days += Math.min(10, sections.tech.animationsList.length);
    days += (sections.general.quantity ?? 1) > 1 ? Math.min(15, sections.general.quantity ?? 1) : 0;
    if (sections.tech.textures.resolution === '4k') days += 2;
    if (sections.tech.textures.resolution === '8k') days += 4;

    const dailyRate = 120;

    return {
      budgetMin: Math.round(days * dailyRate * 0.8),
      budgetMax: Math.round(days * dailyRate * 1.6),
      currency: input.currency,
      daysMin: Math.max(1, Math.round(days * 0.8)),
      daysMax: Math.max(2, Math.round(days * 1.5)),
      rationale: ru
        ? 'Ориентировочная оценка по объёму работ: тип ассета, риггинг, анимации и текстуры. Это не гарантия — итоговую цену стороны согласуют в сделке.'
        : 'A rough estimate based on scope: asset type, rigging, animations and textures. Not a guarantee — the final price is agreed in the deal.',
    };
  }

  async suggestField(input: SuggestFieldInput, context: AIContext): Promise<FieldSuggestion> {
    const ru = context.locale === 'ru';
    const platform = input.sections.tech.platform ?? 'any';

    if (input.field === 'polyBudget') {
      const value = String(POLY_BUDGET[platform] ?? 30_000);
      return {
        value,
        explanation: ru
          ? `Типичный бюджет полигонов для платформы «${platform}».`
          : `A typical poly budget for the "${platform}" platform.`,
      };
    }

    if (input.field === 'formats') {
      return {
        value: 'FBX',
        explanation: ru
          ? 'FBX понимают все распространённые движки.'
          : 'FBX is understood by every common engine.',
      };
    }

    if (input.field === 'revisionRounds') {
      return {
        value: '2',
        explanation: ru
          ? 'Двух раундов правок хватает большинству сделок и это не пугает исполнителя.'
          : 'Two revision rounds cover most deals without scaring contractors away.',
      };
    }

    return {
      value: '',
      explanation: ru
        ? 'Подсказка для этого поля появится, когда будет подключена модель.'
        : 'A hint for this field will appear once a model is connected.',
    };
  }

  async translate(input: TranslateInput, _context: AIContext): Promise<string> {
    // Заглушка не переводит: честнее пометить текст, чем выдать оригинал за перевод.
    return `[${input.targetLocale}] ${input.text}`;
  }

  async improveText(input: ImproveTextInput, _context: AIContext): Promise<string> {
    return input.text.trim().replace(/\s+/gu, ' ');
  }

  async summarizeChat(input: SummarizeInput, context: AIContext): Promise<string> {
    const header = context.locale === 'ru' ? 'Кратко из переписки:' : 'Chat summary:';
    return [header, ...input.messages.slice(-10).map((m) => `— ${m.author}: ${m.text}`)].join('\n');
  }

  async summarizeDispute(input: SummarizeInput, context: AIContext): Promise<string> {
    const header = context.locale === 'ru' ? 'Материалы спора:' : 'Dispute materials:';
    return [header, ...input.messages.map((m) => `— ${m.author}: ${m.text}`)].join('\n');
  }

  async parsePortfolioProfile(
    input: { text: string },
    _context: AIContext,
  ): Promise<ParsedProfile> {
    const style = firstMatch(input.text, KEYWORDS.style);
    const engine = firstMatch(input.text, KEYWORDS.engine);

    return {
      specializations: [],
      styles: style ? [style] : [],
      software: ['Blender'].filter((name) => new RegExp(name, 'iu').test(input.text)),
      engines: engine ? [engine] : [],
      bio: input.text.slice(0, 500),
    };
  }
}

/** Заголовок из первых значимых слов описания. */
function buildTitle(text: string, locale: Locale): string {
  const words = text
    .replace(/\s+/gu, ' ')
    .trim()
    .split(' ')
    .slice(0, 7)
    .join(' ');

  if (words.length >= 3) {
    return words.length > 140 ? `${words.slice(0, 137)}…` : words;
  }

  return locale === 'ru' ? 'Новое техническое задание' : 'New brief';
}

export type { BriefSections };

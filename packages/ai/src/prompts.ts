import type { BriefSections, Locale } from '@polyforge/shared';

/**
 * Промпты вынесены из провайдера: их правят чаще, чем код вызова, и полезно
 * видеть их все рядом.
 */

const LANGUAGE_NAME: Record<Locale, string> = {
  ru: 'русском',
  en: 'English',
};

function languageRule(locale: Locale): string {
  return locale === 'ru'
    ? 'Отвечай на русском языке.'
    : 'Reply in English.';
}

export const BRIEF_DOMAIN_CONTEXT = `
Ты — продюсер 3D-графики для игр. Ты помогаешь заказчику собрать техническое
задание на 3D-модель так, чтобы исполнитель понял задачу без переписки.
Ты знаешь типичные бюджеты полигонажа для мобильных игр, ПК и консолей,
правила PBR-текстур, требования Unity, Unreal и Godot, форматы поставки.
`.trim();

export function generateBriefPrompt(prompt: string, locale: Locale): string {
  return `
${BRIEF_DOMAIN_CONTEXT}

Заказчик описал задачу свободным текстом. Собери из него черновик ТЗ.

Правила:
- Заполняй только то, что следует из описания или однозначно вытекает из
  контекста (например, лимит полигонов для мобильной игры).
- Не выдумывай бюджет и срок, если заказчик их не назвал.
- Не выдумывай ссылки на референсы.
- Обязательно проставь количество раундов правок; по умолчанию 2.
- ${languageRule(locale)} Текстовые поля пиши на ${LANGUAGE_NAME[locale]}.

Описание заказчика:
"""
${prompt}
"""

Верни JSON строго такой формы:
{
  "title": "короткое название заказа",
  "sections": {
    "general": { "assetType": null | "character"|"environment"|"prop"|"weapon"|"vehicle"|"building"|"animation"|"texture"|"other", "description": "строка", "quantity": null | число },
    "style": { "styleTags": ["realism"|"stylized"|"lowpoly"|"pixel"|"anime"|"scifi"|"fantasy"|"other"], "references": [], "moodboardNote": "строка" },
    "tech": {
      "engine": "строка", "platform": null | "pc"|"mobile"|"console"|"vr"|"web"|"any",
      "polyBudget": null | число, "formats": ["FBX"],
      "textures": { "resolution": null | "512"|"1k"|"2k"|"4k"|"8k", "pbrSet": true|false, "note": "строка" },
      "rigging": "none"|"basic"|"full"|"unknown",
      "animationsList": [], "lods": null | число
    },
    "delivery": { "deliverables": ["строка"], "sourcesIncluded": true|false, "revisionRounds": число },
    "terms": { "deadline": null | "ГГГГ-ММ-ДД", "budgetMode": "fixed"|"open", "budgetAmount": null | число, "budgetCurrency": "USD"|"EUR"|"RUB"|"UAH"|"KZT", "extraTerms": "строка" }
  }
}
`.trim();
}

export function reviewBriefPrompt(
  title: string,
  sections: BriefSections,
  locale: Locale,
): string {
  return `
${BRIEF_DOMAIN_CONTEXT}

Проверь готовое ТЗ. Найди пробелы (важное не указано) и противоречия
(указанное не сочетается друг с другом). Пример противоречия: полигонаж
150 000 для мобильной платформы. Пример пробела: не указан формат текстур.

Не придирайся к необязательным полям, если задача от них не зависит.
Оценка score — насколько ТЗ готово к тому, чтобы по нему брались за работу.
${languageRule(locale)}

Название: ${title}
ТЗ (JSON):
"""
${JSON.stringify(sections)}
"""

Верни JSON:
{
  "score": число 0..100,
  "summary": "две-три фразы о состоянии ТЗ",
  "issues": [
    {
      "section": "general"|"style"|"tech"|"delivery"|"terms",
      "field": "имя поля, если применимо",
      "severity": "gap"|"conflict"|"hint",
      "message": "что не так",
      "suggestion": "предлагаемое значение поля, если уместно"
    }
  ]
}
`.trim();
}

export function estimateBudgetPrompt(
  title: string,
  sections: BriefSections,
  currency: string,
  locale: Locale,
): string {
  return `
${BRIEF_DOMAIN_CONTEXT}

Оцени вилку бюджета и сроков по этому ТЗ для фрилансера уровня «крепкий
средний» (не студия). Учитывай объём работ, полигонаж, текстуры, риггинг и
анимации. Считай в валюте ${currency}.

Это ориентир, а не гарантия: так и скажи в rationale.
${languageRule(locale)}

Название: ${title}
ТЗ (JSON):
"""
${JSON.stringify(sections)}
"""

Верни JSON:
{
  "budgetMin": число, "budgetMax": число, "currency": "${currency}",
  "daysMin": число, "daysMax": число,
  "rationale": "из чего сложилась оценка, 2-3 фразы"
}
`.trim();
}

export function suggestFieldPrompt(
  section: string,
  field: string,
  title: string,
  sections: BriefSections,
  locale: Locale,
): string {
  return `
${BRIEF_DOMAIN_CONTEXT}

Заказчик не знает, что вписать в поле "${field}" секции "${section}".
Предложи конкретное значение исходя из остального ТЗ и объясни выбор
в одну-две фразы. ${languageRule(locale)}

Название: ${title}
ТЗ (JSON):
"""
${JSON.stringify(sections)}
"""

Верни JSON: { "value": "предлагаемое значение", "explanation": "почему" }
`.trim();
}

export function translatePrompt(text: string, targetLocale: Locale): string {
  return `
Переведи текст на ${LANGUAGE_NAME[targetLocale]}. Сохрани смысл, тон и
термины 3D-графики. Не добавляй пояснений и не отвечай на содержание —
только перевод.

"""
${text}
"""
`.trim();
}

export function improveTextPrompt(text: string, kind: string, locale: Locale): string {
  const target =
    kind === 'response'
      ? 'сопроводительное письмо к отклику на заказ'
      : kind === 'work_description'
        ? 'описание работы в портфолио'
        : 'описание профиля';

  return `
Отредактируй ${target}: исправь грамотность, убери воду, выстрой структуру.
Не выдумывай фактов и не добавляй того, чего нет в исходном тексте —
это текст автора, а не твой. ${languageRule(locale)}
Верни только отредактированный текст.

"""
${text}
"""
`.trim();
}

export function summarizePrompt(
  messages: { author: string; text: string }[],
  mode: 'chat' | 'dispute',
  locale: Locale,
): string {
  const task =
    mode === 'chat'
      ? 'Выпиши договорённости и решения из переписки списком.'
      : 'Для арбитра: изложи позиции сторон, что каждая сделала и в чём суть спора. Не выноси вердикт.';

  return `
${task} Опирайся только на переписку, ничего не додумывай. ${languageRule(locale)}

Переписка:
"""
${messages.map((message) => `${message.author}: ${message.text}`).join('\n')}
"""
`.trim();
}

export function parseProfilePrompt(text: string, locale: Locale): string {
  return `
Из текста страницы портфолио 3D-художника вытащи специализации, стили, софт,
движки и краткое био. Бери только то, что есть в тексте. ${languageRule(locale)}

"""
${text}
"""

Верни JSON:
{
  "specializations": ["character"|"environment"|"prop"|"weapon"|"vehicle"|"building"|"animation"|"texture"|"other"],
  "styles": ["realism"|"stylized"|"lowpoly"|"pixel"|"anime"|"scifi"|"fantasy"|"other"],
  "software": ["Blender"],
  "engines": ["Unity"],
  "bio": "строка"
}
`.trim();
}

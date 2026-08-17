import { OpenAIProvider, type OpenAIConfig } from './openai';
import { StubAIProvider } from './stub';
import type { AIProvider } from './types';

export * from './types';
export { OpenAIProvider } from './openai';
export { StubAIProvider } from './stub';

export interface AIProviderConfig {
  apiKey: string;
  baseUrl: string;
  strongModel: string;
  cheapModel: string;
  timeoutMs?: number;
}

/**
 * Выбор реализации (§2.1). Без ключа поднимается заглушка: фичи и списание
 * кредитов работают, но помечены как нерабочая модель — вызывающий код
 * смотрит на `provider.isLive` и предупреждает пользователя.
 */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (!config.apiKey) {
    return new StubAIProvider();
  }

  return new OpenAIProvider(config satisfies OpenAIConfig);
}

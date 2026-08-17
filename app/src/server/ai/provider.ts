import 'server-only';

import { createAIProvider, type AIProvider } from '@polyforge/ai';

import { env } from '../env';
import { getSettings } from '../settings';

/**
 * Провайдер ИИ для приложения. Модели берутся из настроек платформы,
 * ключ — из окружения; без ключа поднимается заглушка (см. `isLive`).
 */

let cached: { provider: AIProvider; strong: string; cheap: string } | null = null;

export async function aiProvider(): Promise<AIProvider> {
  const { ai_model_strong, ai_model_cheap } = await getSettings([
    'ai_model_strong',
    'ai_model_cheap',
  ]);

  // Админ может сменить модель без деплоя — пересобираем провайдер, если
  // настройка изменилась.
  if (cached && cached.strong === ai_model_strong && cached.cheap === ai_model_cheap) {
    return cached.provider;
  }

  const provider = createAIProvider({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    strongModel: ai_model_strong,
    cheapModel: ai_model_cheap,
  });

  cached = { provider, strong: ai_model_strong, cheap: ai_model_cheap };
  return provider;
}

/** Работает ли настоящая модель — UI предупреждает, когда это заглушка. */
export function aiIsLive(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

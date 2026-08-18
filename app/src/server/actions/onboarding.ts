'use server';

import { AIError } from '@polyforge/ai';

import { getCurrentUser } from '../auth/session';
import { aiProvider } from '../ai/provider';
import { refundCredits, spendCredits } from '../ai/credits';
import { checkRateLimit } from '../ratelimit';

/**
 * ИИ-онбординг профиля (§4.7, фаза 6).
 *
 * Дизайнер вставляет текст со своей страницы портфолио (ArtStation, Behance,
 * личный сайт) — модель раскладывает его на поля профиля. Это черновик:
 * ничего не сохраняется, пока человек не посмотрит и не нажмёт «Сохранить».
 *
 * Текст вставляется вручную, а не выкачивается по ссылке: ходить на чужие
 * сайты с сервера платформы — это и блокировки, и чужие robots.txt, и
 * ответственность за то, что мы там прочитали.
 */

export interface ParsedProfileDraft {
  specializations: string[];
  styles: string[];
  software: string[];
  engines: string[];
  bio: string;
}

export async function parseProfileText(
  text: string,
): Promise<
  | { ok: true; draft: ParsedProfileDraft; left: number }
  | { ok: false; error: string; values?: Record<string, string | number> }
> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  const trimmed = text.trim();
  if (trimmed.length < 80) return { ok: false, error: 'errors.onboarding.textTooShort' };

  const limit = await checkRateLimit('ai', user.id);
  if (!limit.allowed) {
    return {
      ok: false,
      error: 'errors.rateLimited',
      values: { seconds: limit.retryAfterSeconds },
    };
  }

  const spend = await spendCredits(user.id, 'onboarding_parse', { type: 'user', id: user.id });
  if (!spend.ok) return { ok: false, error: spend.error, values: { left: spend.left } };

  try {
    const provider = await aiProvider();
    const parsed = await provider.parsePortfolioProfile(
      // Обрезаем: страница портфолио бывает огромной, а профиль собирается
      // по первым абзацам не хуже, чем по всей ленте работ.
      { text: trimmed.slice(0, 8000) },
      { locale: user.locale, userId: user.id },
    );

    return {
      ok: true,
      draft: {
        specializations: parsed.specializations,
        styles: parsed.styles,
        software: parsed.software,
        engines: parsed.engines,
        bio: parsed.bio,
      },
      left: spend.left,
    };
  } catch (error) {
    await refundCredits(user.id, 'onboarding_parse', spend.cost, { type: 'user', id: user.id });

    if (error instanceof AIError) {
      return { ok: false, error: error.userMessageKey };
    }

    console.error('[onboarding] разбор портфолио не удался', error);
    return { ok: false, error: 'errors.ai.unavailable' };
  }
}

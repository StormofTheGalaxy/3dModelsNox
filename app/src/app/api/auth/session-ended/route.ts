import { NextResponse } from 'next/server';

import { COOKIES, LOCALES, type Locale } from '@polyforge/shared';

export const dynamic = 'force-dynamic';

/**
 * Выход из протухшей сессии.
 *
 * Proxy работает на Edge и не ходит в БД: он видит только наличие куки и
 * потому уводит «авторизованного» пользователя со страницы входа. Если сессия
 * при этом отозвана на сервере (бан, разлогин со всех устройств, истечение),
 * страница гонит на /login, а proxy — обратно, и получается петля редиректов.
 *
 * Разорвать её может только тот, кто умеет удалять куку, — то есть роут.
 * Сюда ведут серверные страницы, обнаружившие мёртвую сессию.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);

  const requested = url.searchParams.get('locale');
  const locale: Locale = (LOCALES as readonly string[]).includes(requested ?? '')
    ? (requested as Locale)
    : 'ru';

  const next = url.searchParams.get('next') ?? '';
  const loginUrl = new URL(`/${locale}/login`, url.origin);
  // Открытый редирект недопустим: принимаем только внутренние пути.
  if (next.startsWith('/') && !next.startsWith('//')) {
    loginUrl.searchParams.set('next', next);
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(COOKIES.refreshToken);

  return response;
}

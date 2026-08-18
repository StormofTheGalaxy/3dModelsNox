import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { COOKIES, LOCALES } from '@polyforge/shared';

import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/** Пути (без языкового префикса), доступные только авторизованным. */
const PROTECTED_PREFIXES = ['/dashboard', '/invites', '/settings', '/onboarding', '/admin'];

const localePattern = new RegExp(`^/(${LOCALES.join('|')})(?=/|$)`);

function stripLocale(pathname: string): string {
  const withoutLocale = pathname.replace(localePattern, '');
  return withoutLocale === '' ? '/' : withoutLocale;
}

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function proxy(request: NextRequest): NextResponse {
  const response = intlMiddleware(request);

  // Редирект на локализованный URL — авторизацию проверит следующий проход.
  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  const path = stripLocale(request.nextUrl.pathname);
  const locale = localePattern.exec(request.nextUrl.pathname)?.[1] ?? routing.defaultLocale;

  // Proxy работает на Edge и не ходит в БД: здесь только грубая отсечка по
  // наличию сессионной куки. Настоящая проверка прав — на сервере (§9 DoD).
  const hasSession = Boolean(request.cookies.get(COOKIES.refreshToken)?.value);

  if (!hasSession && matches(path, PROTECTED_PREFIXES)) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Увода авторизованного пользователя со страницы входа здесь нет намеренно:
  // proxy видит только наличие куки. Если сессия отозвана на сервере, а кука
  // осталась, такой увод зацикливается со страничным редиректом на /login.
  // Живую сессию отличает страница входа — у неё есть доступ к БД.

  return response;
}

export const config = {
  // Пропускаем api, статику и файлы с расширением.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};

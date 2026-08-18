'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import { COOKIES, LOCALES, ROLE_CONTEXTS, THEMES, type RoleContext } from '@polyforge/shared';

import { getCurrentUser } from '../auth/session';

/**
 * Язык, тема и контекст роли живут в куках (работают для гостей) и
 * дублируются в профиле авторизованного пользователя (§5.2, §4.2).
 */

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocalePreference(locale: string): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set(COOKIES.locale, locale, { path: '/', maxAge: ONE_YEAR, sameSite: 'lax' });

  const user = await getCurrentUser();
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { locale: locale as 'ru' | 'en' },
    });
  }
}

export async function setThemePreference(theme: string): Promise<void> {
  if (!(THEMES as readonly string[]).includes(theme)) return;

  const cookieStore = await cookies();
  cookieStore.set(COOKIES.theme, theme, { path: '/', maxAge: ONE_YEAR, sameSite: 'lax' });

  const user = await getCurrentUser();
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { theme: theme as 'dark' | 'light' | 'system' },
    });
  }
}

export async function setRoleContext(role: string): Promise<void> {
  if (!(ROLE_CONTEXTS as readonly string[]).includes(role)) return;

  const cookieStore = await cookies();
  cookieStore.set(COOKIES.roleContext, role, { path: '/', maxAge: ONE_YEAR, sameSite: 'lax' });

  const user = await getCurrentUser();
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastRoleContext: role as RoleContext },
    });
  }
}

/**
 * Языковые предпочтения (§4.7): перевод входящих, исходящих и контента.
 *
 * Три отдельных переключателя, а не один «включить ИИ-перевод»: это разные
 * по последствиям вещи. Перевод входящих читает только владелец аккаунта,
 * перевод исходящих видит собеседник, а перевод контента влияет на то, в
 * каком виде человек читает чужие заказы и ТЗ.
 */
export async function setTranslationPreferences(input: {
  incoming?: boolean;
  outgoing?: boolean;
  content?: boolean;
}): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.incoming === undefined ? {} : { translateIncoming: input.incoming }),
      ...(input.outgoing === undefined ? {} : { translateOutgoing: input.outgoing }),
      ...(input.content === undefined ? {} : { translateContent: input.content }),
    },
  });

  revalidatePath('/settings');
  return { ok: true };
}

'use server';

import { prisma } from '@polyforge/db';
import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  waitlistSchema,
  type Locale,
} from '@polyforge/shared';

import { requestContext, writeAuditLog } from '../audit';
import { hashPassword, verifyPassword } from '../auth/password';
import {
  createSession,
  destroySession,
  getCurrentUser,
  revokeAllSessions,
} from '../auth/session';
import { generateToken, hashToken } from '../auth/tokens';
import { checkInviteCode, consumeInvite, issueDefaultInvites } from '../invites';
import { sendPasswordResetEmail, sendVerificationEmail } from '../mail';
import { checkRateLimit, resetRateLimit } from '../ratelimit';
import { getSetting } from '../settings';
import { verifyTurnstile } from '../turnstile';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

function localeFrom(value: FormDataEntryValue | null): Locale {
  return value === 'en' ? 'en' : 'ru';
}

// ─── Регистрация ────────────────────────────────────────────────────────────

export async function registerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { ip } = await requestContext();
  const locale = localeFrom(formData.get('locale'));

  const limit = await checkRateLimit('register', ip ?? 'unknown');
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
    nickname: formData.get('nickname'),
    inviteCode: formData.get('inviteCode') ?? '',
    locale,
    acceptTerms: formData.get('acceptTerms') === 'on' || formData.get('acceptTerms') === 'true',
    turnstileToken: formData.get('turnstileToken') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const input = parsed.data;

  if (!(await verifyTurnstile(input.turnstileToken, ip))) {
    return errorState('errors.captcha.failed');
  }

  // Инвайт-гейт: в закрытой бете код обязателен (§1.2.7).
  const inviteOnly = await getSetting('registration_invite_only');
  let inviteId: string | null = null;
  let inviterId: string | null = null;

  if (inviteOnly) {
    if (!input.inviteCode) {
      return errorState('errors.checkFields', { fieldErrors: { inviteCode: 'errors.invite.required' } });
    }
    const check = await checkInviteCode(input.inviteCode);
    if (!check.ok) {
      return errorState('errors.checkFields', { fieldErrors: { inviteCode: check.error } });
    }
    inviteId = check.inviteId;
    inviterId = check.ownerId;
  } else if (input.inviteCode) {
    const check = await checkInviteCode(input.inviteCode);
    if (check.ok) {
      inviteId = check.inviteId;
      inviterId = check.ownerId;
    }
  }

  const nicknameLower = input.nickname.toLowerCase();

  const [emailTaken, nicknameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { nicknameLower }, select: { id: true } }),
  ]);

  const fieldErrors: Record<string, string> = {};
  if (emailTaken) fieldErrors.email = 'errors.email.taken';
  if (nicknameTaken) fieldErrors.nickname = 'errors.nickname.taken';
  if (Object.keys(fieldErrors).length > 0) {
    return errorState('errors.checkFields', { fieldErrors });
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      nickname: input.nickname,
      nicknameLower,
      locale: input.locale,
      invitedById: inviterId,
    },
    select: { id: true, email: true },
  });

  // Инвайт занимаем ПОСЛЕ создания пользователя: если гонка проиграна,
  // аккаунт остаётся, а код освобождается для другого — но такой случай
  // помечаем в аудите, чтобы модератор увидел аномалию.
  if (inviteId) {
    const consumed = await consumeInvite(inviteId, user.id);
    if (!consumed) {
      await writeAuditLog({
        action: 'invite.used',
        actorId: user.id,
        targetType: 'invite',
        targetId: inviteId,
        payload: { race: true },
      });
    }
  }

  await issueDefaultInvites(user.id);

  const token = generateToken();
  await prisma.authToken.create({
    data: {
      type: 'email_verification',
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000),
    },
  });

  try {
    await sendVerificationEmail(user.email, input.locale, token);
  } catch (error) {
    console.error('[auth] письмо подтверждения не ушло', error);
  }

  await writeAuditLog({
    action: 'user.registered',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
    payload: { inviteUsed: Boolean(inviteId) },
  });

  await createSession(user.id);

  return successState({
    redirectTo: `/verify-email?email=${encodeURIComponent(user.email)}`,
  });
}

// ─── Вход ───────────────────────────────────────────────────────────────────

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { ip } = await requestContext();

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    turnstileToken: formData.get('turnstileToken') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const { email, password } = parsed.data;

  // Лимит и по IP, и по email: иначе перебор одного аккаунта с ботнета проходит.
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit('login', ip ?? 'unknown'),
    checkRateLimit('login', `email:${email}`),
  ]);

  if (!byIp.allowed || !byEmail.allowed) {
    const seconds = Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds);
    return errorState('errors.rateLimited', { values: { seconds } });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      status: true,
      banUntil: true,
      emailVerifiedAt: true,
    },
  });

  // Одинаковый ответ на «нет пользователя» и «неверный пароль» —
  // форма входа не должна работать как проверялка существования аккаунтов.
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    await writeAuditLog({ action: 'user.login_failed', payload: { email } });
    return errorState('errors.credentials');
  }

  if (user.status === 'banned' || user.status === 'deleted') {
    return errorState('errors.accountBanned');
  }

  if (user.status === 'temp_banned' && user.banUntil && user.banUntil > new Date()) {
    return errorState('errors.accountBannedUntil', {
      values: { date: user.banUntil.toISOString().slice(0, 10) },
    });
  }

  await createSession(user.id);
  await resetRateLimit('login', `email:${email}`);
  await writeAuditLog({ action: 'user.login', actorId: user.id, targetType: 'user', targetId: user.id });

  return successState({
    redirectTo: user.emailVerifiedAt ? '/dashboard' : '/verify-email',
  });
}

// ─── Выход ──────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  await destroySession();

  if (user) {
    await writeAuditLog({ action: 'user.logout', actorId: user.id });
  }
}

// ─── Подтверждение email ────────────────────────────────────────────────────

export async function verifyEmailToken(token: string): Promise<boolean> {
  if (!token) return false;

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, type: true, expiresAt: true, usedAt: true },
  });

  if (
    !record ||
    record.type !== 'email_verification' ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    return false;
  }

  await prisma.$transaction([
    prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);

  await writeAuditLog({
    action: 'user.email_verified',
    actorId: record.userId,
    targetType: 'user',
    targetId: record.userId,
  });

  return true;
}

export async function resendVerificationAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState('errors.forbidden');
  if (user.emailVerifiedAt) return successState({ message: 'auth.verifySuccess' });

  const limit = await checkRateLimit('password_reset', `verify:${user.id}`);
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  // Прошлые ссылки гасим: одновременно живой должна быть только одна.
  await prisma.authToken.updateMany({
    where: { userId: user.id, type: 'email_verification', usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = generateToken();
  await prisma.authToken.create({
    data: {
      type: 'email_verification',
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000),
    },
  });

  await sendVerificationEmail(user.email, user.locale, token);

  return successState({ message: 'auth.verifyResent' });
}

// ─── Восстановление пароля ──────────────────────────────────────────────────

export async function forgotPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { ip } = await requestContext();

  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
    turnstileToken: formData.get('turnstileToken') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const limit = await checkRateLimit('password_reset', ip ?? 'unknown');
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return errorState('errors.captcha.failed');
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, locale: true, status: true },
  });

  // Ответ одинаков независимо от существования аккаунта — иначе форма
  // превращается в способ проверить, зарегистрирован ли email.
  if (user && user.status !== 'banned' && user.status !== 'deleted') {
    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'password_reset', usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateToken();
    await prisma.authToken.create({
      data: {
        type: 'password_reset',
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000),
      },
    });

    try {
      await sendPasswordResetEmail(user.email, user.locale, token);
    } catch (error) {
      console.error('[auth] письмо сброса пароля не ушло', error);
    }

    await writeAuditLog({
      action: 'user.password_reset_requested',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
    });
  }

  return successState({
    message: 'auth.forgotSent',
    values: { email: parsed.data.email },
  });
}

export async function resetPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: { id: true, userId: true, type: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.type !== 'password_reset' || record.usedAt || record.expiresAt < new Date()) {
    return errorState('errors.token.invalid');
  }

  await prisma.$transaction([
    prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
  ]);

  // Смена пароля выкидывает все устройства — стандартное ожидание пользователя.
  await revokeAllSessions(record.userId);

  await writeAuditLog({
    action: 'user.password_reset_completed',
    actorId: record.userId,
    targetType: 'user',
    targetId: record.userId,
  });

  return successState({ message: 'auth.resetSuccess', redirectTo: '/login' });
}

// ─── Лист ожидания ──────────────────────────────────────────────────────────

export async function joinWaitlistAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { ip } = await requestContext();
  const locale = localeFrom(formData.get('locale'));

  const parsed = waitlistSchema.safeParse({
    email: formData.get('email'),
    note: formData.get('note') ?? '',
    turnstileToken: formData.get('turnstileToken') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.checkFields', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const limit = await checkRateLimit('register', `waitlist:${ip ?? 'unknown'}`);
  if (!limit.allowed) {
    return errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } });
  }

  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return errorState('errors.captcha.failed');
  }

  const existing = await prisma.waitlistEntry.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (existing) {
    return successState({
      message: 'landing.waitlistDuplicate',
      values: { email: parsed.data.email },
    });
  }

  await prisma.waitlistEntry.create({
    data: {
      email: parsed.data.email,
      note: parsed.data.note || null,
      locale,
      source: 'landing',
    },
  });

  await writeAuditLog({
    action: 'waitlist.joined',
    targetType: 'waitlist',
    payload: { email: parsed.data.email },
  });

  return successState({
    message: 'landing.waitlistSuccess',
    values: { email: parsed.data.email },
  });
}

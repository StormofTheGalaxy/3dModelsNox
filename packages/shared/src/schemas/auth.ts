import { z } from 'zod';

import { LIMITS, NICKNAME_PATTERN } from '../constants';
import { LOCALES } from '../locales';

/**
 * Схемы входов аутентификации. Один и тот же объект используется на клиенте
 * (react-hook-form) и на сервере (server action / route handler) — §9 DoD.
 * Тексты ошибок — ключи словаря i18n, а не готовые строки.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'errors.email.invalid')
  .max(LIMITS.emailMax, 'errors.email.tooLong')
  .email('errors.email.invalid');

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, 'errors.password.tooShort')
  .max(LIMITS.passwordMax, 'errors.password.tooLong')
  .refine((value) => /[a-zA-Zа-яА-ЯёЁ]/u.test(value), 'errors.password.needsLetter')
  .refine((value) => /\d/u.test(value), 'errors.password.needsDigit');

export const nicknameSchema = z
  .string()
  .trim()
  .min(LIMITS.nicknameMin, 'errors.nickname.tooShort')
  .max(LIMITS.nicknameMax, 'errors.nickname.tooLong')
  .regex(NICKNAME_PATTERN, 'errors.nickname.invalidChars');

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(LIMITS.inviteCodeLength, 'errors.invite.invalidFormat');

export const localeSchema = z.enum(LOCALES);

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    nickname: nicknameSchema,
    inviteCode: inviteCodeSchema.optional().or(z.literal('')),
    locale: localeSchema.default('ru'),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'errors.terms.required' }),
    }),
    turnstileToken: z.string().min(1, 'errors.captcha.required'),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'errors.password.mismatch',
    path: ['passwordConfirm'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'errors.password.required'),
  turnstileToken: z.string().optional().default(''),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().min(1, 'errors.captcha.required'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16, 'errors.token.invalid'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'errors.password.mismatch',
    path: ['passwordConfirm'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(16, 'errors.token.invalid'),
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const waitlistSchema = z.object({
  email: emailSchema,
  note: z.string().trim().max(500).optional().default(''),
  turnstileToken: z.string().min(1, 'errors.captcha.required'),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;

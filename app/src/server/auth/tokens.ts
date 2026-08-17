import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

import { env } from '../env';

/**
 * Одноразовые токены (подтверждение email, сброс пароля) и JWT для ws-сервиса.
 *
 * В базу кладётся только HMAC-хэш токена: утечка дампа не даёт войти по ссылке
 * из письма. HMAC, а не голый SHA-256, — чтобы нельзя было подобрать по радужным
 * таблицам без знания pepper.
 */

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHmac('sha256', env.AUTH_TOKEN_PEPPER).update(token).digest('hex');
}

/** Сравнение хэшей за постоянное время. */
export function tokensMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Инвайт-код: без похожих символов (0/O, 1/I), чтобы диктовать голосом. */
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 10): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += INVITE_ALPHABET[bytes[index]! % INVITE_ALPHABET.length];
  }
  return code;
}

// ── JWT для реалтайм-сервиса ────────────────────────────────────────────────

// Лениво: на этапе сборки секретов ещё нет, а модуль импортируется.
let jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  jwtSecret ??= new TextEncoder().encode(env.AUTH_JWT_SECRET);
  return jwtSecret;
}

export interface RealtimeTokenClaims {
  sub: string;
  role: string;
}

/**
 * Короткоживущий токен, который клиент отдаёт ws-сервису при handshake.
 * Сессия в браузере остаётся серверной (cookie + запись в БД) — JWT нужен
 * только чтобы ws мог проверить пользователя, не ходя в Postgres.
 */
export async function signRealtimeToken(claims: RealtimeTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('polyforge')
    .setAudience('polyforge-ws')
    .setExpirationTime('5m')
    .sign(getJwtSecret());
}

export async function verifyRealtimeToken(token: string): Promise<RealtimeTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: 'polyforge',
      audience: 'polyforge-ws',
    });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: String(payload.role ?? 'user') };
  } catch {
    return null;
  }
}

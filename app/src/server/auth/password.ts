import 'server-only';

import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id с параметрами OWASP (19 МБ памяти, 2 итерации, параллелизм 1).
 * Ставим их явно: значения по умолчанию у библиотек меняются между версиями.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain, OPTIONS);
  } catch {
    // Битый хэш в базе не должен превращаться в 500 на форме входа.
    return false;
  }
}

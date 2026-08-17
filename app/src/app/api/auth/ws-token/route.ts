import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/server/auth/session';
import { signRealtimeToken } from '@/server/auth/tokens';

export const dynamic = 'force-dynamic';

/**
 * Выдаёт короткоживущий JWT для handshake с ws-сервисом (§2.1).
 * Сессия остаётся серверной — наружу уходит только 5-минутный токен.
 */
export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user || !user.emailVerifiedAt) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token = await signRealtimeToken({ sub: user.id, role: user.role });

  return NextResponse.json({ token, expiresInSeconds: 300 });
}

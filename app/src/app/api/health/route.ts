import { NextResponse } from 'next/server';

import { prisma } from '@polyforge/db';

import { redis } from '@/server/redis';

export const dynamic = 'force-dynamic';

/**
 * Health-check для docker compose и мониторинга.
 * Проверяет не только «процесс жив», но и доступность зависимостей.
 */
export async function GET() {
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const database = checks[0]?.status === 'fulfilled';
  const cache = checks[1]?.status === 'fulfilled';
  const healthy = database && cache;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database,
      redis: cache,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}

import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { PrismaClient };

/**
 * Единый клиент Prisma для app, ws и worker.
 *
 * В dev Next.js пересоздаёт модули при hot reload — без кэша в globalThis
 * пул соединений разрастается до отказа Postgres.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

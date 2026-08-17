import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

import { QUEUES } from '@polyforge/shared';

/**
 * Фоновые задачи (§2.1).
 *
 * В фазе 0 поднят каркас BullMQ: подключение, очереди, graceful shutdown и
 * плановая очистка протухших токенов. Обработчики писем, водяных знаков,
 * ИИ-задач и дайджестов добавляются в фазах 1–6.
 */

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// BullMQ требует отключённого лимита ретраев на блокирующих командах.
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);

const workers: Worker[] = [];
const queues: Queue[] = [];

/** Регистрирует очередь и воркер с одинаковым подключением. */
function register(name: string, processor: (job: Job) => Promise<void>): void {
  queues.push(new Queue(name, { connection }));

  const worker = new Worker(name, processor, { connection, concurrency: CONCURRENCY });

  worker.on('failed', (job, error) => {
    console.error(`[worker:${name}] задача ${job?.id ?? '?'} упала:`, error.message);
  });

  workers.push(worker);
}

register(QUEUES.email, async (job) => {
  // Письма фазы 0 (подтверждение, сброс пароля) отправляются синхронно из app:
  // пользователь ждёт результат на экране. Очередь готова для дайджестов (фаза 6).
  console.info(`[worker:email] задача ${job.name} принята`);
});

register(QUEUES.media, async (job) => {
  // Сжатие, webp и водяные знаки — фазы 1 и 4.
  console.info(`[worker:media] задача ${job.name} принята`);
});

register(QUEUES.ai, async (job) => {
  // Генерация ТЗ, переводы, саммари — фазы 2 и 6.
  console.info(`[worker:ai] задача ${job.name} принята`);
});

register(QUEUES.maintenance, async (job) => {
  if (job.name === 'purge-expired-tokens') {
    const { prisma } = await import('@polyforge/db');
    const result = await prisma.authToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    console.info(`[worker:maintenance] удалено протухших токенов: ${result.count}`);
    return;
  }

  console.info(`[worker:maintenance] задача ${job.name} принята`);
});

/** Повторяющиеся задачи. Ключ повторения не даёт дублировать расписание. */
async function scheduleRepeatableJobs(): Promise<void> {
  const maintenance = queues.find((queue) => queue.name === QUEUES.maintenance);
  if (!maintenance) return;

  await maintenance.add(
    'purge-expired-tokens',
    {},
    {
      repeat: { pattern: '0 4 * * *' },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );
}

void scheduleRepeatableJobs().catch((error: unknown) => {
  console.error('[worker] не удалось поставить регулярные задачи', error);
});

console.info(`[worker] запущен, очереди: ${Object.values(QUEUES).join(', ')}`);

async function shutdown(signal: string): Promise<void> {
  console.info(`[worker] ${signal} — останавливаюсь`);
  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled(queues.map((queue) => queue.close()));
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

import { QUEUES } from '@polyforge/shared';

import { markImageFailed, processImage, type ProcessImagePayload } from './jobs/process-image';
import { storage } from './storage';

/**
 * Фоновые задачи (§2.1).
 *
 * Фаза 1: сжатие изображений портфолио и очистка осиротевших объектов.
 * Письма, ИИ-задачи, водяные знаки и дайджесты — фазы 2, 4 и 6.
 */

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// BullMQ требует отключённого лимита ретраев на блокирующих командах.
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);

const workers: Worker[] = [];
const queues = new Map<string, Queue>();

function register(name: string, processor: (job: Job) => Promise<void>): void {
  queues.set(name, new Queue(name, { connection }));

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
  if (job.name !== 'process-image') {
    console.info(`[worker:media] неизвестная задача ${job.name}`);
    return;
  }

  const payload = job.data as ProcessImagePayload;

  try {
    await processImage(payload);
    console.info(`[worker:media] изображение ${payload.mediaId} обработано`);
  } catch (error) {
    // На последней попытке помечаем медиа как failed: показывать спиннер
    // бесконечно хуже, чем честно сказать, что превью не собралось.
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await markImageFailed(payload.mediaId);
    }
    throw error;
  }
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

  if (job.name === 'delete-storage-objects') {
    const { keys } = job.data as { keys: string[] };
    // Производные webp лежат рядом с оригиналом — удаляем и их.
    const allKeys = keys.flatMap((key) => [
      key,
      key.replace(/\.[^./]+$/, '.display.webp'),
      key.replace(/\.[^./]+$/, '.thumb.webp'),
    ]);
    await storage().delete('public', allKeys);
    console.info(`[worker:maintenance] удалено объектов: ${allKeys.length}`);
    return;
  }

  console.info(`[worker:maintenance] задача ${job.name} принята`);
});

/** Повторяющиеся задачи. Ключ повторения не даёт дублировать расписание. */
async function scheduleRepeatableJobs(): Promise<void> {
  const maintenance = queues.get(QUEUES.maintenance);
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
  await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

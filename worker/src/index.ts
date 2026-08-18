import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

import { QUEUES } from '@polyforge/shared';

import { generateBriefPdf, markBriefPdfFailed, type BriefPdfPayload } from './jobs/brief-pdf';
import {
  recomputeOnTimeMetrics,
  remindMilestoneDeadlines,
  remindStuckPayments,
} from './jobs/deal-maintenance';
import { summarizeDisputeJob, type DisputeSummaryPayload } from './jobs/dispute-summary';
import {
  grantAchievementsBatch,
  publishExpiredReviews,
  recomputeLevels,
} from './jobs/reputation';
import {
  archiveExpiredOrders,
  dispatchSavedFilterMatches,
  flagInactiveCustomers,
} from './jobs/order-maintenance';
import { closeNotifier } from './notify';
import { markImageFailed, processImage, type ProcessImagePayload } from './jobs/process-image';
import { applyWatermark, markWatermarkFailed, type WatermarkPayload } from './jobs/watermark';
import { storage } from './storage';

/**
 * Фоновые задачи (§2.1).
 *
 * Фазы 1–4: сжатие изображений портфолио, экспорт ТЗ в PDF, гигиена витрины
 * заказов, дайджесты по сохранённым фильтрам, водяные знаки на превью
 * финальных сдач, напоминания о дедлайнах и зависших оплатах, репутация:
 * публикация отзывов по сроку, пересчёт уровней, выдача достижений.
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
  if (job.name === 'brief-pdf') {
    const payload = job.data as BriefPdfPayload;
    try {
      await generateBriefPdf(payload);
      console.info(`[worker:media] ТЗ ${payload.briefId} экспортировано в PDF`);
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await markBriefPdfFailed(payload.briefId);
      }
      throw error;
    }
    return;
  }

  if (job.name === 'watermark') {
    const payload = job.data as WatermarkPayload;
    try {
      await applyWatermark(payload);
      console.info(`[worker:media] водяной знак нанесён на файл ${payload.deliveryFileId}`);
    } catch (error) {
      // Флаг снимаем только на последней попытке: иначе UI перестанет ждать
      // знак, который ещё может появиться.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await markWatermarkFailed(payload.deliveryFileId);
      }
      throw error;
    }
    return;
  }

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
  if (job.name === 'dispute-summary') {
    const payload = job.data as DisputeSummaryPayload;
    await summarizeDisputeJob(payload);
    console.info(`[worker:ai] саммари спора ${payload.disputeId} готово`);
    return;
  }

  // Генерация ТЗ и переводы идут синхронно из app: пользователь ждёт ответ.
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

  if (job.name === 'archive-expired-orders') {
    const count = await archiveExpiredOrders();
    console.info(`[worker:maintenance] заказов заархивировано: ${count}`);
    return;
  }

  if (job.name === 'flag-inactive-customers') {
    const { prisma } = await import('@polyforge/db');
    const setting = await prisma.platformSetting.findUnique({
      where: { key: 'order_inactive_customer_days' },
      select: { value: true },
    });
    const days = typeof setting?.value === 'number' ? setting.value : 7;

    const count = await flagInactiveCustomers(days);
    console.info(`[worker:maintenance] откликов без реакции: ${count}`);
    return;
  }

  if (job.name === 'saved-filter-digest') {
    const count = await dispatchSavedFilterMatches();
    console.info(`[worker:maintenance] дайджестов отправлено: ${count}`);
    return;
  }

  if (job.name === 'remind-deadlines') {
    const { prisma } = await import('@polyforge/db');
    const setting = await prisma.platformSetting.findUnique({
      where: { key: 'deadline_reminder_hours' },
      select: { value: true },
    });
    const hours = Array.isArray(setting?.value) ? (setting.value as number[]) : [48, 24];

    const count = await remindMilestoneDeadlines(hours);
    console.info(`[worker:maintenance] напоминаний о дедлайне: ${count}`);
    return;
  }

  if (job.name === 'remind-stuck-payments') {
    const { prisma } = await import('@polyforge/db');
    const setting = await prisma.platformSetting.findUnique({
      where: { key: 'payment_stuck_reminder_days' },
      select: { value: true },
    });
    const days = Array.isArray(setting?.value) ? (setting.value as number[]) : [1, 3];

    const count = await remindStuckPayments(days);
    console.info(`[worker:maintenance] напоминаний об оплате: ${count}`);
    return;
  }

  if (job.name === 'recompute-ontime') {
    const count = await recomputeOnTimeMetrics();
    console.info(`[worker:maintenance] метрик «в срок» пересчитано: ${count}`);
    return;
  }

  if (job.name === 'publish-reviews') {
    const count = await publishExpiredReviews();
    console.info(`[worker:maintenance] отзывов опубликовано по сроку: ${count}`);
    return;
  }

  if (job.name === 'recompute-levels') {
    const count = await recomputeLevels();
    console.info(`[worker:maintenance] уровней изменено: ${count}`);
    return;
  }

  if (job.name === 'grant-achievements') {
    const count = await grantAchievementsBatch();
    console.info(`[worker:maintenance] достижений выдано: ${count}`);
    return;
  }

  if (job.name === 'expire-strikes') {
    const { expireStrikesAndBans } = await import('./jobs/strikes');
    const result = await expireStrikesAndBans();
    console.info(
      `[worker:maintenance] страйков истекло: ${result.strikes}, банов снято: ${result.bans}`,
    );
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

  const repeatable = [
    // Протухшие токены — ночью, нагрузки на базу это не создаёт.
    { name: 'purge-expired-tokens', pattern: '0 4 * * *' },
    // Автоархив заказов (§4.5) — раз в час, чтобы срок истекал вовремя.
    { name: 'archive-expired-orders', pattern: '15 * * * *' },
    // Молчащие заказчики — раз в сутки, чаще это уже назойливость.
    { name: 'flag-inactive-customers', pattern: '30 9 * * *' },
    // Дайджест по сохранённым фильтрам — дважды в день.
    { name: 'saved-filter-digest', pattern: '0 9,18 * * *' },
    // Дедлайны этапов: раз в час — окно напоминания как раз часовое (§4.6).
    { name: 'remind-deadlines', pattern: '5 * * * *' },
    // Зависшие оплаты — раз в сутки: пороги в настройках заданы в днях.
    { name: 'remind-stuck-payments', pattern: '45 10 * * *' },
    // Метрика «сдано в срок» — ночью, она нигде не нужна в реальном времени.
    { name: 'recompute-ontime', pattern: '20 3 * * *' },
    // Отзывы с истёкшим слепым периодом — раз в час: срок задан в днях,
    // но публиковать их в один момент суток незачем.
    { name: 'publish-reviews', pattern: '25 * * * *' },
    // Пересчёт уровней — еженедельно (§3), ночью с воскресенья на понедельник.
    { name: 'recompute-levels', pattern: '0 2 * * 1' },
    // Достижения — ежедневно: тост про новую ачивку не должен ждать неделю.
    { name: 'grant-achievements', pattern: '40 3 * * *' },
    // Истечение страйков и снятие временных банов — ежедневно.
    { name: 'expire-strikes', pattern: '10 1 * * *' },
  ];

  for (const job of repeatable) {
    await maintenance.add(
      job.name,
      {},
      { repeat: { pattern: job.pattern }, removeOnComplete: 20, removeOnFail: 50 },
    );
  }
}

void scheduleRepeatableJobs().catch((error: unknown) => {
  console.error('[worker] не удалось поставить регулярные задачи', error);
});

console.info(`[worker] запущен, очереди: ${Object.values(QUEUES).join(', ')}`);

async function shutdown(signal: string): Promise<void> {
  console.info(`[worker] ${signal} — останавливаюсь`);
  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
  await closeNotifier();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

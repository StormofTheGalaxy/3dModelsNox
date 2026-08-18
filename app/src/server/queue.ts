import 'server-only';

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { QUEUES, type QueueName } from '@polyforge/shared';

import { env } from './env';

/**
 * Продюсер фоновых задач. Воркер — отдельный процесс (§2.1); приложение только
 * ставит задачи в очередь и не ждёт результата.
 *
 * BullMQ требует собственное подключение с `maxRetriesPerRequest: null`,
 * поэтому кэш из `redis.ts` здесь не переиспользуется.
 */
const globalForQueues = globalThis as unknown as {
  bullConnection?: IORedis;
  bullQueues?: Map<QueueName, Queue>;
};

function connection(): IORedis {
  globalForQueues.bullConnection ??= new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return globalForQueues.bullConnection;
}

function queue(name: QueueName): Queue {
  globalForQueues.bullQueues ??= new Map();

  const existing = globalForQueues.bullQueues.get(name);
  if (existing) return existing;

  const created = new Queue(name, { connection: connection() });
  globalForQueues.bullQueues.set(name, created);
  return created;
}

export interface ProcessImageJob {
  mediaId: string;
  storageKey: string;
}

/**
 * Ставит изображение в очередь на сжатие и конвертацию в webp.
 * Ошибка постановки не должна ломать загрузку: медиа уже сохранено и
 * показывается в оригинале, пока воркер до него не дошёл.
 */
export async function enqueueImageProcessing(job: ProcessImageJob): Promise<void> {
  try {
    await queue(QUEUES.media).add('process-image', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  } catch (error) {
    console.error('[queue] не удалось поставить обработку изображения', error);
  }
}

export interface BriefPdfJob {
  briefId: string;
  locale: 'ru' | 'en';
}

/**
 * Экспорт ТЗ в PDF (§4.4). Генерация идёт в воркере: рендер документа
 * занимает секунды и не должен держать запрос пользователя.
 */
export async function enqueueBriefPdf(job: BriefPdfJob): Promise<void> {
  try {
    await queue(QUEUES.media).add('brief-pdf', job, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3_000 },
      removeOnComplete: 50,
      removeOnFail: 200,
    });
  } catch (error) {
    console.error('[queue] не удалось поставить экспорт ТЗ в PDF', error);
  }
}

/** Удаление осиротевших объектов хранилища после удаления работы. */
export async function enqueueStorageCleanup(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  try {
    await queue(QUEUES.maintenance).add(
      'delete-storage-objects',
      { keys },
      { attempts: 3, removeOnComplete: 50, removeOnFail: 200 },
    );
  } catch (error) {
    console.error('[queue] не удалось поставить очистку хранилища', error);
  }
}

export interface WatermarkJob {
  deliveryFileId: string;
}

/**
 * Водяной знак на превью финального этапа (§4.6).
 *
 * До подтверждения оплаты заказчик видит только помеченное превью —
 * это единственная защита, которую платформа может дать дизайнеру,
 * не участвуя в расчётах.
 */
export async function enqueueWatermark(job: WatermarkJob): Promise<void> {
  try {
    await queue(QUEUES.media).add('watermark', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  } catch (error) {
    console.error('[queue] не удалось поставить нанесение водяного знака', error);
  }
}

export interface DisputeSummaryJob {
  disputeId: string;
}

/** Резюме спора для арбитра: длинный запрос к модели, место ему в воркере. */
export async function enqueueDisputeSummary(job: DisputeSummaryJob): Promise<void> {
  try {
    await queue(QUEUES.ai).add('dispute-summary', job, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 50,
      removeOnFail: 200,
    });
  } catch (error) {
    console.error('[queue] не удалось поставить резюме спора', error);
  }
}

export interface BroadcastJob {
  broadcastId: string;
}

/**
 * Ручная рассылка (§4.10). Уходит в очередь писем: отправка сотням адресатов
 * занимает минуты и не может держать запрос админки.
 */
export async function enqueueBroadcast(job: BroadcastJob): Promise<void> {
  try {
    await queue(QUEUES.email).add('broadcast', job, {
      attempts: 1,
      removeOnComplete: 20,
      removeOnFail: 50,
    });
  } catch (error) {
    console.error('[queue] не удалось поставить рассылку', error);
  }
}

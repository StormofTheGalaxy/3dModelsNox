import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { PutOptions, LocalConfig, StorageBucket, StorageProvider } from './types';

/**
 * Драйвер для локальной разработки: файлы лежат на диске, приложение отдаёт
 * их через route handler. Прод всегда работает на S3.
 */
export class LocalStorage implements StorageProvider {
  constructor(private readonly config: LocalConfig) {}

  /**
   * Ключ приходит из запроса, поэтому путь проверяется на выход за пределы
   * каталога: `../../etc/passwd` не должен ничего прочитать.
   */
  private pathFor(bucket: StorageBucket, key: string): string {
    const base = resolve(this.config.rootDir, bucket);
    const target = resolve(base, normalize(key));

    if (target !== base && !target.startsWith(base + sep)) {
      throw new Error(`Недопустимый ключ объекта: ${key}`);
    }

    return target;
  }

  async put(
    bucket: StorageBucket,
    key: string,
    body: Buffer | Readable,
    _options: PutOptions,
  ): Promise<void> {
    const target = this.pathFor(bucket, key);
    await mkdir(dirname(target), { recursive: true });

    if (Buffer.isBuffer(body)) {
      await pipeline(async function* () {
        yield body;
      }, createWriteStream(target));
      return;
    }

    await pipeline(body, createWriteStream(target));
  }

  async get(bucket: StorageBucket, key: string): Promise<Buffer> {
    return readFile(this.pathFor(bucket, key));
  }

  async delete(bucket: StorageBucket, keys: string[]): Promise<void> {
    await Promise.all(
      keys.map((key) => rm(this.pathFor(bucket, key), { force: true })),
    );
  }

  async exists(bucket: StorageBucket, key: string): Promise<boolean> {
    try {
      const info = await stat(this.pathFor(bucket, key));
      return info.isFile();
    } catch {
      return false;
    }
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  async signedUrl(_bucket: StorageBucket, key: string): Promise<string> {
    // Подписи в локальном режиме не нужны: доступ и так только с машины разработчика.
    return join(this.config.publicBaseUrl, key);
  }
}

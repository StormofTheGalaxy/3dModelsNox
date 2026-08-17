import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { LocalStorage } from './local';
import { S3Storage } from './s3';
import type { StorageConfig, StorageProvider } from './types';

export type { StorageBucket, StorageConfig, StorageProvider, PutOptions } from './types';

/**
 * Файловое хранилище (§2.1). Два бакета: публичный с CDN для картинок и
 * приватный для чеков и файлов сделок (фаза 4) — доступ туда только по
 * подписанным ссылкам.
 *
 * Драйвер выбирается конфигурацией: S3 в проде, диск в локальной разработке,
 * где поднимать S3-совместимое хранилище ради пары картинок не нужно.
 */
export function createStorage(config: StorageConfig): StorageProvider {
  return config.driver === 's3' ? new S3Storage(config) : new LocalStorage(config);
}

/**
 * Каталог локального хранилища.
 *
 * Относительный путь разрешается от корня монорепо, а не от cwd: app в dev
 * стартует из `app/`, а воркер — из `worker/`, и оба должны видеть одни файлы.
 */
export function resolveLocalRoot(dir: string, startFrom = process.cwd()): string {
  if (isAbsolute(dir)) return dir;

  let current = resolve(startFrom);

  for (let depth = 0; depth < 10; depth += 1) {
    const manifestPath = join(current, 'package.json');

    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          workspaces?: unknown;
        };
        if (manifest.workspaces) return resolve(current, dir);
      } catch {
        // повреждённый package.json — просто идём выше
      }
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return resolve(startFrom, dir);
}

/**
 * Ключ объекта: `<purpose>/<ownerId>/<random>.<ext>`.
 *
 * Случайный сегмент, а не имя файла пользователя: имена бывают одинаковыми,
 * содержат путь и раскрывают лишнее о загрузившем.
 */
export function buildStorageKey(
  purpose: string,
  ownerId: string,
  extension: string,
): string {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${purpose}/${ownerId}/${randomBytes(12).toString('hex')}.${safeExtension}`;
}

/** Ключ производного файла рядом с оригиналом: `key` → `key.thumb.webp`. */
export function derivedKey(originalKey: string, suffix: string): string {
  const withoutExtension = originalKey.replace(/\.[^./]+$/, '');
  return `${withoutExtension}.${suffix}.webp`;
}

export function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  return map[mime] ?? 'bin';
}

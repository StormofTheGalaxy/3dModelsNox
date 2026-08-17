import 'server-only';

import {
  createStorage,
  resolveLocalRoot,
  type StorageConfig,
  type StorageProvider,
} from '@polyforge/storage';

import { env } from './env';

/**
 * Хранилище файлов приложения. Конфигурация собирается лениво — как и всё,
 * что читает секреты (см. ADR-0001 §7).
 */

/** Локальные файлы отдаёт route handler, а не CDN. */
export const LOCAL_MEDIA_ROUTE = '/api/media';

let cached: StorageProvider | null = null;

function buildConfig(): StorageConfig {
  if (env.STORAGE_DRIVER === 's3') {
    return {
      driver: 's3',
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicBucket: env.S3_BUCKET_PUBLIC,
      privateBucket: env.S3_BUCKET_PRIVATE,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL || env.S3_ENDPOINT,
    };
  }

  return {
    driver: 'local',
    rootDir: resolveLocalRoot(env.STORAGE_LOCAL_DIR),
    publicBaseUrl: LOCAL_MEDIA_ROUTE,
  };
}

export function storage(): StorageProvider {
  cached ??= createStorage(buildConfig());
  return cached;
}

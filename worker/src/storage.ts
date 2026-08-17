import {
  createStorage,
  resolveLocalRoot,
  type StorageConfig,
  type StorageProvider,
} from '@polyforge/storage';

/**
 * Хранилище воркера. Конфигурация та же, что у приложения: в локальном режиме
 * оба процесса обязаны смотреть в один каталог, иначе воркер не найдёт оригинал.
 */

let cached: StorageProvider | null = null;

function buildConfig(): StorageConfig {
  if (process.env.STORAGE_DRIVER === 's3') {
    return {
      driver: 's3',
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? 'ru-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      publicBucket: process.env.S3_BUCKET_PUBLIC ?? 'polyforge-public',
      privateBucket: process.env.S3_BUCKET_PRIVATE ?? 'polyforge-private',
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || (process.env.S3_ENDPOINT ?? ''),
    };
  }

  return {
    driver: 'local',
    rootDir: resolveLocalRoot(process.env.STORAGE_LOCAL_DIR ?? '.data/uploads'),
    publicBaseUrl: '/api/media',
  };
}

export function storage(): StorageProvider {
  cached ??= createStorage(buildConfig());
  return cached;
}

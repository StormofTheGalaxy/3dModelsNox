import type { Readable } from 'node:stream';

export type StorageBucket = 'public' | 'private';

export interface PutOptions {
  contentType: string;
  contentLength?: number;
  /** Кэш для CDN. По умолчанию — год: ключи неизменяемые. */
  cacheControl?: string;
}

export interface StorageProvider {
  put(bucket: StorageBucket, key: string, body: Buffer | Readable, options: PutOptions): Promise<void>;
  get(bucket: StorageBucket, key: string): Promise<Buffer>;
  delete(bucket: StorageBucket, keys: string[]): Promise<void>;
  exists(bucket: StorageBucket, key: string): Promise<boolean>;
  /** Прямая ссылка. Осмысленна только для публичного бакета. */
  publicUrl(key: string): string;
  /** Временная ссылка на приватный объект. */
  signedUrl(bucket: StorageBucket, key: string, ttlSeconds: number): Promise<string>;
}

export interface S3Config {
  driver: 's3';
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
  /** База CDN для публичных объектов. */
  publicBaseUrl: string;
}

export interface LocalConfig {
  driver: 'local';
  /** Каталог на диске, куда складываются файлы. */
  rootDir: string;
  /** Префикс URL, по которому их отдаёт приложение. */
  publicBaseUrl: string;
}

export type StorageConfig = S3Config | LocalConfig;

import type { Readable } from 'node:stream';

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { PutOptions, S3Config, StorageBucket, StorageProvider } from './types';

/** S3-совместимое хранилище (Timeweb S3 и любое другое с S3 API). */
export class S3Storage implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Timeweb и большинство совместимых хранилищ работают по path-style.
      forcePathStyle: true,
    });
  }

  private bucketName(bucket: StorageBucket): string {
    return bucket === 'public' ? this.config.publicBucket : this.config.privateBucket;
  }

  async put(
    bucket: StorageBucket,
    key: string,
    body: Buffer | Readable,
    options: PutOptions,
  ): Promise<void> {
    // Upload из lib-storage сам разбивает поток на части: видео до 200 МБ
    // единым PutObject не отправить.
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl ?? 'public, max-age=31536000, immutable',
        ACL: bucket === 'public' ? 'public-read' : undefined,
      },
    });

    await upload.done();
  }

  async get(bucket: StorageBucket, key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
    );

    if (!response.Body) {
      throw new Error(`Объект не найден: ${key}`);
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(bucket: StorageBucket, keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucketName(bucket),
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }

  async exists(bucket: StorageBucket, key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  async signedUrl(bucket: StorageBucket, key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}

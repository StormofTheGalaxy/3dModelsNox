import { NextResponse } from 'next/server';

import { env } from '@/server/env';
import { storage } from '@/server/storage';

/**
 * Отдаёт файлы локального хранилища в режиме разработки. В проде публичные
 * объекты забирает CDN напрямую из S3, и этот маршрут не используется.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<NextResponse> {
  if (env.STORAGE_DRIVER !== 'local') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { key } = await params;
  const objectKey = key.join('/');

  try {
    const body = await storage().get('public', objectKey);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentTypeFor(objectKey),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}

function contentTypeFor(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
  };
  return map[extension] ?? 'application/octet-stream';
}

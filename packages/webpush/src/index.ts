import { StubWebPushProvider } from './stub';
import type { WebPushProvider } from './types';
import { VapidWebPushProvider } from './vapid';

export * from './types';
export { StubWebPushProvider } from './stub';
export { VapidWebPushProvider } from './vapid';

/**
 * Выбор реализации. Без пары ключей поднимается заглушка — как у ИИ и бота:
 * фича целиком проходима локально, а `provider.isLive` говорит интерфейсу,
 * что настоящих уведомлений не будет.
 */
export function createWebPushProvider(
  publicKey: string,
  privateKey: string,
  subject: string,
): WebPushProvider {
  return publicKey && privateKey
    ? new VapidWebPushProvider(publicKey, privateKey, subject)
    : new StubWebPushProvider();
}

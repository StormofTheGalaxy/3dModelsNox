import type {
  WebPushMessage,
  WebPushProvider,
  WebPushSendResult,
  WebPushSubscription,
} from './types';

/**
 * Заглушка пушей — для разработки и CI, где ключей VAPID нет и быть не должно.
 *
 * Смысл тот же, что у заглушек ИИ и бота: весь путь фичи (подписка в
 * браузере, выбор канала по настройкам, отметка о доставке, удаление
 * протухшей подписки) проходится без внешнего сервиса.
 *
 * Ключ здесь настоящая точка кривой P-256, а не набор символов: браузер
 * проверяет её на `subscribe()` и на выдуманной откажет — тогда путь фичи
 * оборвался бы на первом же шаге. Приватной половины у него нет ни у кого,
 * поэтому подписать им ничего нельзя, и публиковать его в исходниках
 * безопасно.
 */
const STUB_PUBLIC_KEY =
  'BABbitzrBSXi2EUFHDcPY7IOgFn5kr4ivbyEQKE5T54oemnEUUlaA-T_Ciz2dWi1t5PooV4IVjGJHz6OTpHUOHg';

export class StubWebPushProvider implements WebPushProvider {
  readonly isLive = false;
  readonly publicKey = STUB_PUBLIC_KEY;

  private readonly outbox: { endpoint: string; message: WebPushMessage }[] = [];

  send(
    subscription: WebPushSubscription,
    message: WebPushMessage,
  ): Promise<WebPushSendResult> {
    this.outbox.push({ endpoint: subscription.endpoint, message });
    console.info(`[webpush:stub] → ${subscription.endpoint.slice(0, 48)}…: ${message.title}`);
    return Promise.resolve({ ok: true, expired: false });
  }

  /** Что «ушло» за время жизни процесса — только для тестов и отладки. */
  sent(): readonly { endpoint: string; message: WebPushMessage }[] {
    return this.outbox;
  }
}

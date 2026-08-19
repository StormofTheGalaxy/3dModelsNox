import {
  PaymentError,
  type CreateIntentInput,
  type PaymentEvent,
  type PaymentIntent,
  type PaymentProvider,
} from './types';

/**
 * Ручной провайдер — то, как платформа работает сегодня (§1.2.1).
 *
 * Это не заглушка на время разработки: стороны действительно платят друг
 * другу напрямую, а платформа фиксирует присланные ими подтверждения.
 * Поэтому `createIntent` не создаёт никакого платежа у провайдера — он
 * только описывает намерение, которое дальше закрывается чеком в сделке.
 *
 * Отдельно важно, чего он НЕ делает: не возвращает `succeeded`. Провайдер,
 * умеющий сам себе подтвердить оплату, однажды подтвердит её в проде.
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual';
  readonly movesMoney = false;

  private readonly intents = new Map<string, PaymentIntent>();

  createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const intent: PaymentIntent = {
      id: `manual_${input.milestoneId}`,
      status: 'created',
      amount: input.amount,
      feeMinor: input.feeMinor,
      // Страницы оплаты нет: человек платит тем способом, о котором
      // договорился со второй стороной, и присылает подтверждение.
      confirmationUrl: null,
    };

    this.intents.set(intent.id, intent);
    return Promise.resolve(intent);
  }

  getIntent(intentId: string): Promise<PaymentIntent | null> {
    return Promise.resolve(this.intents.get(intentId) ?? null);
  }

  cancelIntent(intentId: string): Promise<void> {
    const intent = this.intents.get(intentId);
    if (intent) this.intents.set(intentId, { ...intent, status: 'canceled' });
    return Promise.resolve();
  }

  parseWebhook(): Promise<PaymentEvent | null> {
    // Никакой провайдер сюда не стучится: адреса вебхука у ручного режима
    // нет. Пришедшее сюда — ошибка конфигурации, и молчать о ней нельзя.
    throw new PaymentError('Ручной провайдер не принимает вебхуки', 'errors.payment.noWebhook');
  }
}

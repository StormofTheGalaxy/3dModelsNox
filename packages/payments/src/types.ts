/**
 * Платёжный модуль (§1.2.2, post-MVP №11).
 *
 * Интерфейс назван в ТЗ прямым текстом: «платёжный модуль (интерфейс
 * `PaymentProvider`)». Здесь он и объявлен — целиком, но ни одной
 * настоящей реализации за ним пока нет и быть не может.
 *
 * Причина не техническая. §1.2.1 заморожен: платформа не является
 * стороной расчётов, юрлица нет, комиссий нет. Пункт списка post-MVP
 * так и записан — «при появлении юрлица». Поэтому задача этого модуля —
 * не провести платёж, а сделать так, чтобы в день появления юрлица
 * подключение провайдера было работой на неделю, а не переписыванием
 * сделки.
 */

export type PaymentIntentStatus =
  /** Создан, деньги не двигались. */
  | 'created'
  /** Плательщик ушёл на страницу провайдера. */
  | 'pending'
  /** Провайдер подтвердил зачисление. */
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded';

export interface PaymentAmount {
  /** В минимальных единицах валюты: копейки, центы. Дробей в деньгах не бывает. */
  minor: number;
  /** Трёхбуквенный код: RUB, USD, EUR. */
  currency: string;
}

export interface CreateIntentInput {
  /** Идентификатор этапа сделки — по нему платёж находит своё место. */
  milestoneId: string;
  amount: PaymentAmount;
  /** Комиссия платформы, уже посчитанная. Ноль — комиссии выключены. */
  feeMinor: number;
  /** Кто платит и кому. Провайдеру нужны обе стороны. */
  payerId: string;
  payeeId: string;
  /** Куда вернуть человека после оплаты. */
  returnUrl: string;
  description: string;
}

export interface PaymentIntent {
  /** Идентификатор на стороне провайдера. */
  id: string;
  status: PaymentIntentStatus;
  amount: PaymentAmount;
  feeMinor: number;
  /** Куда отправить плательщика; у ручного провайдера его нет. */
  confirmationUrl: string | null;
}

/** Разобранное событие провайдера: платёж прошёл, отменён, возвращён. */
export interface PaymentEvent {
  intentId: string;
  status: PaymentIntentStatus;
  amount: PaymentAmount;
  raw: unknown;
}

export interface PaymentProvider {
  /** Имя реализации — попадает в журнал и в админку. */
  readonly name: string;
  /**
   * Двигает ли этот провайдер настоящие деньги.
   *
   * У ручного — `false`, и это не заглушка на время разработки, а
   * описание того, как платформа работает сегодня: стороны платят друг
   * другу сами, а платформа записывает их подтверждения.
   */
  readonly movesMoney: boolean;

  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  getIntent(intentId: string): Promise<PaymentIntent | null>;
  cancelIntent(intentId: string): Promise<void>;

  /**
   * Разбор входящего уведомления провайдера.
   *
   * Подпись проверяет реализация: у каждого провайдера она своя, и
   * выносить её наружу — значит однажды забыть проверить.
   */
  parseWebhook(body: string, headers: Record<string, string>): Promise<PaymentEvent | null>;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly userMessageKey: string = 'errors.payment.failed',
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

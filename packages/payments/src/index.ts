import { ManualPaymentProvider } from './manual';
import type { PaymentProvider } from './types';

export * from './types';
export * from './commission';
export { ManualPaymentProvider } from './manual';

/**
 * Выбор реализации.
 *
 * Сегодня выбор один, и это честно: юрлица нет, договора с провайдером
 * нет, а провайдер, которого нельзя проверить настоящим платежом, — это
 * не готовность, а её имитация. Функция существует ради того дня, когда
 * появится второй вариант: тогда изменится одна строка здесь, а не
 * половина сделки.
 */
export function createPaymentProvider(driver: string): PaymentProvider {
  switch (driver) {
    case 'manual':
    default:
      return new ManualPaymentProvider();
  }
}

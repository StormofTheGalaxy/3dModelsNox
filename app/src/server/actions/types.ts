/**
 * Состояние формы для `useActionState`.
 *
 * Сообщения — это ключи словаря i18n, а не готовые строки: сервер не знает,
 * на каком языке пользователь читает интерфейс (§9 DoD).
 */
export interface ActionState {
  status: 'idle' | 'success' | 'error';
  /** Ключ i18n для общей ошибки/успеха формы. */
  message?: string;
  /** Значения для подстановки в сообщение. */
  values?: Record<string, string | number>;
  /** Ключи i18n по именам полей. */
  fieldErrors?: Record<string, string>;
  /** Куда отправить пользователя после успеха. */
  redirectTo?: string;
}

export const idleState: ActionState = { status: 'idle' };

export function errorState(
  message: string,
  extra?: Partial<Omit<ActionState, 'status' | 'message'>>,
): ActionState {
  return { status: 'error', message, ...extra };
}

export function successState(extra?: Partial<Omit<ActionState, 'status'>>): ActionState {
  return { status: 'success', ...extra };
}

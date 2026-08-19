'use client';

import { useEffect } from 'react';

/**
 * Регистрация service worker (§4.7, post-MVP №8).
 *
 * Регистрируется молча и без интерфейса: воркер нужен и тем, кто не
 * подписывался на пуши, — ради внятной страницы вместо ошибки браузера,
 * когда пропала связь.
 *
 * При выключенном флаге компонент не просто не регистрирует воркер, а
 * снимает уже установленный: иначе выключение фичи оставило бы на
 * устройствах кэш и обработчик пушей, которые платформа больше не
 * контролирует.
 */
export function ServiceWorkerRegistrar({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (!enabled) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => undefined);
      return;
    }

    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Не критично: без воркера приложение работает как обычный сайт.
    });
  }, [enabled]);

  return null;
}

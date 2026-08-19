/**
 * Service worker (§4.7, post-MVP №8).
 *
 * Делает две вещи и ничего сверх того: показывает внятную страницу вместо
 * ошибки браузера, когда связи нет, и доставляет пуши.
 *
 * Кэширование ответов приложения здесь намеренно не делается. Заказы,
 * отклики и сделки меняются постоянно, и показать вчерашний список
 * откликов как сегодняшний — хуже, чем честно сказать «нет сети».
 * Поэтому кэшируется только оболочка офлайн-страницы.
 */

const CACHE = 'polyforge-shell-v1';
const OFFLINE_URLS = ['/ru/offline', '/en/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(OFFLINE_URLS))
      // Установка не должна падать из-за одной недокачанной страницы:
      // без офлайн-оболочки пуши всё равно обязаны работать.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Язык из пути запроса — офлайн-страница показывается на нём же. */
function offlineUrlFor(url) {
  return new URL(url).pathname.startsWith('/en') ? '/en/offline' : '/ru/offline';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Вмешиваемся только в переходы по страницам: запросы за данными и
  // файлами пусть падают как падали, их обрабатывает само приложение.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      const offline = await cache.match(offlineUrlFor(request.url));
      return offline ?? Response.error();
    }),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, url, tag } = payload;
  if (!title) return;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      // Одинаковый тег заменяет прошлое уведомление молча: перезвон по
      // второму отклику подряд раздражает сильнее, чем помогает.
      renotify: false,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Уже открытая вкладка приложения переиспользуется: плодить окна на
      // каждое уведомление — верный способ получить их десяток.
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          return client.focus().then((focused) => focused.navigate(target));
        }
      }

      return self.clients.openWindow(target);
    }),
  );
});

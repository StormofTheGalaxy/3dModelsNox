import webpush from 'web-push';

/**
 * Генерация пары ключей VAPID (§4.7, post-MVP №8).
 *
 * Пара делается один раз на установку и живёт в переменных окружения.
 * Менять её нельзя без цены: публичный ключ вшит в каждую оформленную
 * подписку, и после смены все они разом перестают работать — людям
 * придётся включать уведомления заново.
 */
const keys = webpush.generateVAPIDKeys();

console.log('WEB_PUSH_PUBLIC_KEY=' + keys.publicKey);
console.log('WEB_PUSH_PRIVATE_KEY=' + keys.privateKey);
console.log('WEB_PUSH_SUBJECT=mailto:admin@example.com');
console.log('');
console.log('Скопируйте в .env. Приватный ключ не коммитить.');

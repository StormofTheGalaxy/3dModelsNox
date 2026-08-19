import type { MetadataRoute } from 'next';

/**
 * Манифест приложения (§4.7, post-MVP №8).
 *
 * Манифест одноязычный по устройству: система читает его один раз при
 * установке, языкового согласования у него нет. Берём русский — основной
 * язык платформы (§1.2.4), — а внутри приложение остаётся двуязычным.
 *
 * `start_url` без языкового префикса: с ярлыка человек попадает на общий
 * вход, а язык выберет тот же proxy, что и при обычном заходе.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PolyForge — биржа 3D-моделей для игр',
    short_name: 'PolyForge',
    description:
      'Заказы на 3D-модели, техзадания, сделки и портфолио дизайнеров в одном месте.',
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    // Цвет строки состояния — тёмный фон приложения: светлая полоса над
    // тёмным интерфейсом читается как чужая рамка.
    background_color: '#0B0D12',
    theme_color: '#0B0D12',
    categories: ['business', 'productivity', 'graphics'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Заказы', url: '/ru/orders' },
      { name: 'Мои сделки', url: '/ru/deals' },
      { name: 'Уведомления', url: '/ru/notifications' },
    ],
  };
}

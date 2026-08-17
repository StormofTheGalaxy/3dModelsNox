import { COOKIES } from '@polyforge/shared';

/**
 * Ставит класс темы до первой отрисовки, иначе на светлой теме мигает тёмный фон.
 * Сервер уже проставил класс из куки; скрипт нужен только для режима «системная»,
 * где ответ знает лишь браузер.
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var match = document.cookie.match(/(?:^|; )${COOKIES.theme}=([^;]*)/);
    var preference = match ? decodeURIComponent(match[1]) : 'dark';
    var resolved = preference;
    if (preference === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    var root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(resolved === 'light' ? 'light' : 'dark');
  } catch (error) {
    document.documentElement.classList.add('dark');
  }
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}

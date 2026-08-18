import Script from 'next/script';

import { publicEnv } from '@/server/env';

/**
 * Счётчики Яндекс.Метрики и GA4 (§7, фаза 7).
 *
 * Подключаются только когда заданы идентификаторы и только в проде: гонять
 * статистику разработки в те же счётчики — верный способ испортить данные
 * запуска. Стратегия `afterInteractive` — счётчик не должен задерживать
 * первую отрисовку.
 */
export function Analytics() {
  if (process.env.NODE_ENV !== 'production') return null;

  const ym = publicEnv.NEXT_PUBLIC_YM_ID;
  const ga = publicEnv.NEXT_PUBLIC_GA_ID;

  if (!ym && !ga) return null;

  return (
    <>
      {ym ? (
        <Script id="ym-counter" strategy="afterInteractive">
          {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${JSON.stringify(ym)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});`}
        </Script>
      ) : null}

      {ga ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="ga-counter" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag("js",new Date());gtag("config",${JSON.stringify(ga)});`}
          </Script>
        </>
      ) : null}
    </>
  );
}

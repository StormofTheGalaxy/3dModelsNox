'use client';

import { Download, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Установка приложения (§4.7, post-MVP №8).
 *
 * Браузер сам решает, когда предложить установку, и отдаёт событие ровно
 * один раз. Ловим его и прячем до нажатия: всплывающая плашка «установите
 * приложение» поверх содержимого — то, что закрывают не читая.
 *
 * Safari события не шлёт вовсе, поэтому для iOS остаётся подсказать путь
 * руками — другого способа установить туда веб-приложение нет.
 *
 * Пока предложить нечего — событие не пришло, а устройство не яблочное, —
 * карточка не рисуется вовсе: заголовок с описанием и без единого действия
 * занимает экран и ничего не даёт.
 */

/**
 * Состояние среды читается снимком, а не состоянием в эффекте: на сервере
 * ни `matchMedia`, ни user-agent браузера нет, а после монтирования эти
 * значения уже не меняются.
 */
const NEVER_CHANGES = () => () => undefined;

function readStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function readIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const t = useTranslations('pwa.install');

  const [event, setEvent] = useState<InstallEvent | null>(null);
  // Уже запущено с ярлыка — предлагать установку незачем.
  const standalone = useSyncExternalStore(NEVER_CHANGES, readStandalone, () => false);
  const isIos = useSyncExternalStore(NEVER_CHANGES, readIos, () => false);
  const [justInstalled, setJustInstalled] = useState(false);

  const installed = standalone || justInstalled;

  useEffect(() => {
    function onPrompt(incoming: Event) {
      incoming.preventDefault();
      setEvent(incoming as InstallEvent);
    }

    function onInstalled() {
      setJustInstalled(true);
      setEvent(null);
    }

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!event) return;

    await event.prompt();
    const choice = await event.userChoice;

    // Событие одноразовое: после показа диалога второй раз его не вызвать.
    setEvent(null);
    if (choice.outcome === 'accepted') setJustInstalled(true);
  }

  if (!installed && !event && !isIos) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone aria-hidden className="size-5 text-accent" />
          {t('title')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('hint')}</p>

        {installed ? (
          <Alert tone="success">{t('installed')}</Alert>
        ) : event ? (
          <Button className="sm:w-fit" onClick={install}>
            <Download aria-hidden />
            {t('action')}
          </Button>
        ) : (
          <Alert tone="info">{t('iosHint')}</Alert>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { BellRing, BellOff, Monitor, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import {
  removePushDevice,
  removePushSubscription,
  savePushSubscription,
} from '@/server/actions/push';

/**
 * Пуш-уведомления (§4.7, post-MVP №8).
 *
 * Разрешение спрашивается только по нажатию: браузер запоминает отказ
 * навсегда, и всплывший сам собой запрос — это один шанс, потраченный на
 * человека, который ещё не понял, о чём его спрашивают.
 */

export interface PushDevice {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSentAt: string | null;
}

/**
 * Возможности браузера читаются снимком, а не через состояние в эффекте:
 * на сервере их нет, и любой другой способ либо расходится с разметкой при
 * гидратации, либо вызывает лишний проход рендера.
 */
const NEVER_CHANGES = () => () => undefined;

function readSupport(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function readDenied(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}

/** base64url ключа VAPID → байты, как того требует PushManager. */
function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);

  return bytes;
}

export function PushSettings({
  publicKey,
  pushIsLive,
  devices,
}: {
  publicKey: string;
  /** Настоящие ключи или заглушка: без них уведомления никуда не уйдут. */
  pushIsLive: boolean;
  devices: PushDevice[];
}) {
  const t = useTranslations('pwa.push');
  const tRoot = useTranslations();
  const router = useRouter();

  const supported = useSyncExternalStore(NEVER_CHANGES, readSupport, () => false);
  const deniedAtLoad = useSyncExternalStore(NEVER_CHANGES, readDenied, () => false);

  // Отказ, полученный прямо сейчас: снимок разрешения о нём не узнает —
  // событий смены разрешения браузер не шлёт.
  const [deniedNow, setDeniedNow] = useState(false);
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [pending, startTransition] = useTransition();

  const denied = deniedAtLoad || deniedNow;

  useEffect(() => {
    if (!supported) return;

    // Подписано ли именно это устройство — знает только сам браузер:
    // в списке с сервера все устройства выглядят одинаково.
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribedHere(subscription !== null))
      .catch(() => undefined);
  }, [supported]);

  function subscribe() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
          setDeniedNow(permission === 'denied');
          toast.error(t('denied'));
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          // Пуши без видимого уведомления браузеры не разрешают, и это
          // правильно: фоновая доставка молча — путь к слежке.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(publicKey),
        });

        const json = subscription.toJSON();

        const result = await savePushSubscription({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
          userAgent: navigator.userAgent,
        });

        if (!result.ok) {
          await subscription.unsubscribe();
          toast.error(tRoot(result.error ?? 'errors.generic'));
          return;
        }

        setSubscribedHere(true);
        toast.success(t('subscribed'));
        router.refresh();
      } catch {
        toast.error(tRoot('errors.generic'));
      }
    });
  }

  function unsubscribe() {
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }

      setSubscribedHere(false);
      toast.success(t('unsubscribed'));
      router.refresh();
    });
  }

  function forget(id: string) {
    startTransition(async () => {
      const result = await removePushDevice(id);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing aria-hidden className="size-5 text-accent" />
          {t('title')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('hint')}</p>

        {!pushIsLive ? <Alert tone="warning">{t('stub')}</Alert> : null}
        {!supported ? <Alert tone="info">{t('unsupported')}</Alert> : null}
        {denied ? <Alert tone="warning">{t('blocked')}</Alert> : null}

        {supported ? (
          subscribedHere ? (
            <Button variant="outline" className="sm:w-fit" loading={pending} onClick={unsubscribe}>
              <BellOff aria-hidden />
              {t('unsubscribe')}
            </Button>
          ) : (
            <Button className="sm:w-fit" loading={pending} disabled={denied} onClick={subscribe}>
              <BellRing aria-hidden />
              {t('subscribe')}
            </Button>
          )
        ) : null}

        {devices.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-[var(--pf-border)] pt-4">
            <p className="text-sm font-medium">{t('devicesTitle')}</p>

            <ul className="flex flex-col gap-2">
              {devices.map((device) => {
                const mobile = /Android|iPhone|iPad|Mobile/i.test(device.userAgent ?? '');
                const Icon = mobile ? Smartphone : Monitor;

                return (
                  <li
                    key={device.id}
                    className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <Icon aria-hidden className="size-4 shrink-0 text-fg-muted" />
                      <span className="truncate">{describe(device.userAgent)}</span>
                    </span>

                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() => forget(device.id)}
                    >
                      {t('forget')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Человекочитаемое имя устройства из user-agent.
 *
 * Полную строку показывать незачем: в ней сотня символов служебных версий,
 * а узнать своё устройство человек должен с одного взгляда.
 */
function describe(userAgent: string | null): string {
  if (!userAgent) return '—';

  const os =
    /Android/i.test(userAgent) ? 'Android'
    : /iPhone|iPad|iOS/i.test(userAgent) ? 'iOS'
    : /Mac OS X/i.test(userAgent) ? 'macOS'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Linux/i.test(userAgent) ? 'Linux'
    : '';

  const browser =
    /Edg\//i.test(userAgent) ? 'Edge'
    : /OPR\//i.test(userAgent) ? 'Opera'
    : /Chrome\//i.test(userAgent) ? 'Chrome'
    : /Firefox\//i.test(userAgent) ? 'Firefox'
    : /Safari\//i.test(userAgent) ? 'Safari'
    : '';

  return [browser, os].filter(Boolean).join(' · ') || userAgent.slice(0, 40);
}

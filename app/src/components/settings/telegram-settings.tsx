'use client';

import { Check, Copy, Send, Unlink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import {
  createTelegramLink,
  setTelegramNotifications,
  unlinkTelegram,
} from '@/server/actions/telegram';

/**
 * Подключение Telegram (§3, post-MVP №2).
 *
 * Ссылка выдаётся по кнопке и живёт минуты: держать вечный диплинк в
 * настройках — то же самое, что вечный пароль в открытом виде.
 */
export function TelegramSettings({
  linked,
  username,
  enabled,
  botConfigured,
}: {
  linked: boolean;
  username: string | null;
  enabled: boolean;
  /** Настоящий бот или заглушка: без токена сообщения никуда не уйдут. */
  botConfigured: boolean;
}) {
  const t = useTranslations('settings.telegram');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();

  const [link, setLink] = useState<{ url: string; minutes: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [notify, setNotify] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function requestLink() {
    startTransition(async () => {
      const result = await createTelegramLink();

      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }

      setLink({ url: result.url, minutes: result.expiresInMinutes });
    });
  }

  function copyLink() {
    if (!link) return;
    void navigator.clipboard.writeText(link.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function unlink() {
    startTransition(async () => {
      const result = await unlinkTelegram();

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      setLink(null);
      router.refresh();
    });
  }

  function toggle(value: boolean) {
    setNotify(value);

    startTransition(async () => {
      const result = await setTelegramNotifications(value);
      if (!result.ok) {
        setNotify(!value);
        toast.error(tRoot('errors.generic'));
      }
    });
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send aria-hidden className="size-5 text-fg-muted" />
          {t('title')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('hint')}</p>

        {!botConfigured ? <Alert tone="warning">{t('botNotConfigured')}</Alert> : null}

        {linked ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-2 px-4 py-3">
              <span className="text-sm">
                {username ? t('linkedAs', { username }) : t('linkedNoUsername')}
              </span>
              <Button variant="ghost" size="sm" loading={pending} onClick={unlink}>
                <Unlink aria-hidden />
                {t('unlink')}
              </Button>
            </div>

            <label className="flex flex-wrap items-start justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t('enabled.label')}</span>
                <span className="block text-sm text-fg-muted">{t('enabled.hint')}</span>
              </span>
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0"
                checked={notify}
                onChange={(event) => toggle(event.target.checked)}
              />
            </label>
          </>
        ) : link ? (
          <div className="flex flex-col gap-3">
            <Alert tone="info">{t('linkReady', { minutes: link.minutes })}</Alert>

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <Send aria-hidden />
                  {t('openBot')}
                </a>
              </Button>

              {/* Ссылку может понадобиться перенести на телефон — на десктопе
                  открывать её в браузере бессмысленно. */}
              <Button variant="outline" onClick={copyLink}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? tCommon('copied') : tCommon('copy')}
              </Button>
            </div>
          </div>
        ) : (
          <Button className="sm:w-fit" loading={pending} onClick={requestLink}>
            <Send aria-hidden />
            {t('connect')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

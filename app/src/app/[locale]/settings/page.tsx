import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TelegramSettings } from '@/components/settings/telegram-settings';
import { TranslationSettings } from '@/components/settings/translation-settings';
import { requireUser } from '@/server/auth/guards';
import { telegramIsLive } from '@/server/telegram';
import { getSetting } from '@/server/settings';
import { prisma } from '@polyforge/db';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings' });
  return { title: t('title') };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Настройки аккаунта доступны и до подтверждения email — иначе пользователь
  // не сможет сменить язык интерфейса, чтобы прочитать инструкцию.
  const user = await requireUser(locale);
  const t = await getTranslations('settings');

  // Поля Telegram нужны только здесь, поэтому не едут в каждой сессии.
  const [telegramOn, telegram] = await Promise.all([
    getSetting('feature_telegram'),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        telegramChatId: true,
        telegramUsername: true,
        telegramNotifications: true,
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold sm:text-3xl">{t('title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('account')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm text-fg-muted">{t('email')}</span>
              <span className="text-sm">{user.email}</span>
            </div>
            <Badge variant={user.emailVerifiedAt ? 'success' : 'warning'}>
              {user.emailVerifiedAt ? t('emailVerified') : t('emailNotVerified')}
            </Badge>
          </div>

          {/* Язык и тема переключаются в шапке — дублировать элементы управления
              незачем, поэтому здесь только текущее состояние. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--pf-border)] pt-4">
            <span className="text-sm text-fg-muted">{t('language')}</span>
            <Badge variant="outline">{user.locale.toUpperCase()}</Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--pf-border)] pt-4">
            <span className="text-sm text-fg-muted">{t('theme')}</span>
            <Badge variant="outline">{user.theme}</Badge>
          </div>
        </CardContent>
      </Card>

      <TranslationSettings
        incoming={user.translateIncoming}
        outgoing={user.translateOutgoing}
        content={user.translateContent}
      />

      {telegramOn ? (
        <TelegramSettings
          linked={Boolean(telegram?.telegramChatId)}
          username={telegram?.telegramUsername ?? null}
          enabled={telegram?.telegramNotifications ?? true}
          botConfigured={telegramIsLive()}
        />
      ) : null}
    </div>
  );
}

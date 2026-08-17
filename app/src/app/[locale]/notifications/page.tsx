import type { Metadata } from 'next';
import { Bell } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { NotificationList } from '@/components/notifications/notification-list';
import { requireVerifiedUser } from '@/server/auth/guards';
import { countUnread, listNotifications } from '@/server/notifications';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'notifications' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVerifiedUser(locale);
  const [t, notifications, unread] = await Promise.all([
    getTranslations('notifications'),
    listNotifications(user.id),
    countUnread(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">{t('title')}</h1>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title={t('empty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <NotificationList
              unread={unread}
              items={notifications.map((notification) => ({
                id: notification.id,
                type: notification.type,
                payload: notification.payload as Record<string, string | number | boolean>,
                readAt: notification.readAt?.toISOString() ?? null,
                createdAt: notification.createdAt.toISOString(),
              }))}
              locale={locale}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

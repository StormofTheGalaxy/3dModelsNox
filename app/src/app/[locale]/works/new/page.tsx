import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { createWorkDraft } from '@/server/actions/works';
import { requireVerifiedUser } from '@/server/auth/guards';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'works' });
  return { title: t('new') };
}

export default async function NewWorkPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireVerifiedUser(locale);

  const [t, tProfile] = await Promise.all([
    getTranslations('works'),
    getTranslations('profile'),
  ]);

  // Черновик создаётся сразу: загруженным файлам нужно к чему привязаться.
  const draft = await createWorkDraft();

  if ('error' in draft) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 sm:px-6">
        <Alert tone="warning">{t('needProfile')}</Alert>
        <Button asChild className="sm:w-fit">
          <Link href="/profile/designer">{tProfile('createProfile')}</Link>
        </Button>
      </div>
    );
  }

  // Форма создания и редактирования одна и та же: черновик отличается только
  // пустым заголовком, поэтому переиспользуем маршрут правки.
  redirect(`/${locale}/works/${draft.workId}/edit`);
}

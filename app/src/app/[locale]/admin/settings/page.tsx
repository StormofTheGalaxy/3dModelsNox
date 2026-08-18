import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SETTINGS_REGISTRY, SETTING_KEYS, type SettingKey } from '@polyforge/shared';

import { SettingsEditor } from '@/components/admin/settings-editor';
import { getCurrentUser } from '@/server/auth/session';
import { getAllSettings } from '@/server/settings';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Реестр настроек платформы (§4.10, §6).
 *
 * Ни один порог не зашит в код — критерий приёмки фазы в том, что админ
 * управляет платформой, не трогая репозиторий.
 */
export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (user?.role !== 'admin') notFound();

  const [values, t] = await Promise.all([getAllSettings(), getTranslations('admin')]);

  const groups = new Map<string, SettingKey[]>();
  for (const key of SETTING_KEYS) {
    const group = SETTINGS_REGISTRY[key].group;
    groups.set(group, [...(groups.get(group) ?? []), key]);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t('nav.settings')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('settings.description')}</p>
      </div>

      {[...groups.entries()].map(([group, keys]) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t(`settings.groups.${group}`)}</h2>

          {keys.map((key) => (
            <SettingsEditor
              key={key}
              settingKey={key}
              label={SETTINGS_REGISTRY[key].label[locale === 'en' ? 'en' : 'ru']}
              value={JSON.stringify(values[key])}
              defaultValue={JSON.stringify(SETTINGS_REGISTRY[key].default)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

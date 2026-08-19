'use client';

import { Eye, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import {
  ACHIEVEMENT_AUDIENCES,
  ACHIEVEMENT_ICONS,
  ACHIEVEMENT_METRICS,
} from '@polyforge/shared';

import { achievementIcon } from '@/components/achievements/achievement-icon';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import {
  createAchievement,
  deleteAchievement,
  setAchievementEnabled,
  updateAchievement,
} from '@/server/actions/achievement-admin';
import { cn } from '@/lib/utils';

/**
 * Конструктор достижений (§3, post-MVP №9).
 *
 * Метрика выбирается из списка, а не пишется условием: собрать метрику —
 * это запрос к базе, и поле ввода здесь было бы способом уронить платформу
 * из админки.
 *
 * Системные достижения правятся частично: ключ и метрика заданы кодом,
 * подписи живут в словарях. Админу остаются пороги, иконка и видимость —
 * то, что и должно настраиваться без деплоя.
 */

export interface BuilderItem {
  id: string;
  key: string;
  title: string;
  description: string;
  audience: string;
  metric: string;
  thresholds: Record<string, number>;
  icon: string;
  isHidden: boolean;
  isSystem: boolean;
  isEnabled: boolean;
  holders: number;
  percent: number;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
}

interface FormState {
  key: string;
  audience: string;
  metric: string;
  bronze: string;
  silver: string;
  gold: string;
  icon: string;
  isHidden: boolean;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
}

const EMPTY: FormState = {
  key: '',
  audience: 'designer',
  metric: ACHIEVEMENT_METRICS[0],
  bronze: '1',
  silver: '5',
  gold: '20',
  icon: 'Award',
  isHidden: false,
  titleRu: '',
  titleEn: '',
  descriptionRu: '',
  descriptionEn: '',
};

function toForm(item: BuilderItem): FormState {
  return {
    key: item.key,
    audience: item.audience,
    metric: item.metric,
    bronze: String(item.thresholds.bronze ?? 1),
    silver: String(item.thresholds.silver ?? 5),
    gold: String(item.thresholds.gold ?? 20),
    icon: item.icon,
    isHidden: item.isHidden,
    titleRu: item.titleRu,
    titleEn: item.titleEn,
    descriptionRu: item.descriptionRu,
    descriptionEn: item.descriptionEn,
  };
}

export function AchievementBuilder({
  items,
  builderEnabled,
}: {
  items: BuilderItem[];
  builderEnabled: boolean;
}) {
  const t = useTranslations('admin.achievements');
  const tRoot = useTranslations();
  const router = useRouter();

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [pending, startTransition] = useTransition();

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function payload() {
    return {
      key: form.key.trim(),
      audience: form.audience,
      metric: form.metric,
      bronze: Number(form.bronze),
      silver: Number(form.silver),
      gold: Number(form.gold),
      icon: form.icon,
      isHidden: form.isHidden,
      titleRu: form.titleRu,
      titleEn: form.titleEn,
      descriptionRu: form.descriptionRu,
      descriptionEn: form.descriptionEn,
    };
  }

  function submit() {
    startTransition(async () => {
      const result =
        editing && editing !== 'new'
          ? await updateAchievement(editing, payload())
          : await createAchievement(payload());

      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }

      setEditing(null);
      setForm(EMPTY);
      toast.success(t('saved'));
      router.refresh();
    });
  }

  function act(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      router.refresh();
    });
  }

  const system = editing !== null && editing !== 'new' && items.find((item) => item.id === editing)?.isSystem;

  return (
    <div className="flex flex-col gap-4">
      {!builderEnabled ? <Alert tone="info">{t('builderOff')}</Alert> : null}

      {builderEnabled && editing === null ? (
        <Button
          className="sm:w-fit"
          onClick={() => {
            setForm(EMPTY);
            setEditing('new');
          }}
        >
          <Plus aria-hidden />
          {t('create')}
        </Button>
      ) : null}

      {editing !== null ? (
        <Card className="border-accent/40">
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{editing === 'new' ? t('create') : t('edit')}</h2>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                <X aria-hidden />
                {t('cancel')}
              </Button>
            </div>

            {system ? <Alert tone="info">{t('systemHint')}</Alert> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ach-key">{t('key')}</Label>
                <Input
                  id="ach-key"
                  value={form.key}
                  disabled={Boolean(system)}
                  onChange={(event) => field('key', event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ach-metric">{t('metric')}</Label>
                <Select
                  id="ach-metric"
                  value={form.metric}
                  disabled={Boolean(system)}
                  onChange={(event) => field('metric', event.target.value)}
                >
                  {ACHIEVEMENT_METRICS.map((metric) => (
                    <option key={metric} value={metric}>
                      {t(`metrics.${metric}`)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ach-audience">{t('audience')}</Label>
                <Select
                  id="ach-audience"
                  value={form.audience}
                  onChange={(event) => field('audience', event.target.value)}
                >
                  {ACHIEVEMENT_AUDIENCES.map((audience) => (
                    <option key={audience} value={audience}>
                      {t(`audiences.${audience}`)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ach-icon">{t('icon')}</Label>
                <Select
                  id="ach-icon"
                  value={form.icon}
                  onChange={(event) => field('icon', event.target.value)}
                >
                  {ACHIEVEMENT_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(['bronze', 'silver', 'gold'] as const).map((tier) => (
                <div key={tier} className="flex flex-col gap-1.5">
                  <Label htmlFor={`ach-${tier}`}>{t(`tiers.${tier}`)}</Label>
                  <Input
                    id={`ach-${tier}`}
                    type="number"
                    min={1}
                    value={form[tier]}
                    onChange={(event) => field(tier, event.target.value)}
                  />
                </div>
              ))}
            </div>

            {!system ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ach-title-ru">{t('titleRu')}</Label>
                  <Input
                    id="ach-title-ru"
                    value={form.titleRu}
                    maxLength={80}
                    onChange={(event) => field('titleRu', event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ach-title-en">{t('titleEn')}</Label>
                  <Input
                    id="ach-title-en"
                    value={form.titleEn}
                    maxLength={80}
                    onChange={(event) => field('titleEn', event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ach-desc-ru">{t('descriptionRu')}</Label>
                  <Textarea
                    id="ach-desc-ru"
                    rows={2}
                    maxLength={300}
                    value={form.descriptionRu}
                    onChange={(event) => field('descriptionRu', event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ach-desc-en">{t('descriptionEn')}</Label>
                  <Textarea
                    id="ach-desc-en"
                    rows={2}
                    maxLength={300}
                    value={form.descriptionEn}
                    onChange={(event) => field('descriptionEn', event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isHidden}
                onChange={(event) => field('isHidden', event.target.checked)}
                className="size-4 accent-[var(--pf-accent)]"
              />
              {t('hidden')}
            </label>

            <Button className="sm:w-fit" loading={pending} onClick={submit}>
              {t('save')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const Icon = achievementIcon(item.icon);

          return (
            <li key={item.id}>
              <Card className={cn(!item.isEnabled && 'opacity-60')}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Icon aria-hidden className="size-4" />
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.title}</span>
                        {item.isSystem ? (
                          <Badge variant="neutral">{t('system')}</Badge>
                        ) : (
                          <Badge variant="accent">{t('custom')}</Badge>
                        )}
                        {item.isHidden ? <Badge variant="outline">{t('hiddenShort')}</Badge> : null}
                        {!item.isEnabled ? (
                          <Badge variant="warning">{t('disabled')}</Badge>
                        ) : null}
                      </div>

                      <p className="mt-0.5 text-xs break-words text-fg-muted">
                        {t(`metrics.${item.metric}`)} · {item.thresholds.bronze} /{' '}
                        {item.thresholds.silver} / {item.thresholds.gold} ·{' '}
                        {t('rarity', { percent: item.percent, holders: item.holders })}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() => act(() => setAchievementEnabled(item.id, !item.isEnabled))}
                    >
                      {item.isEnabled ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                      {item.isEnabled ? t('turnOff') : t('turnOn')}
                    </Button>

                    {builderEnabled ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() => {
                          setForm(toForm(item));
                          setEditing(item.id);
                        }}
                      >
                        <Pencil aria-hidden />
                        {t('edit')}
                      </Button>
                    ) : null}

                    {/* Удаление — только у собственных и только пока их никто
                        не получил: иначе на полках останутся записи без
                        подписи и иконки. */}
                    {builderEnabled && !item.isSystem && item.holders === 0 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() => act(() => deleteAchievement(item.id))}
                      >
                        <Trash2 aria-hidden />
                        {t('delete')}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import {
  ART_STYLES,
  AVAILABILITY_STATES,
  CURRENCIES,
  ENGINE_PRESETS,
  SOFTWARE_PRESETS,
  SPECIALIZATIONS,
  SPOKEN_LANGUAGES,
} from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChipSelect } from '@/components/ui/chip-select';
import { ProfileAiImport } from '@/components/profile/profile-ai-import';
import { Field, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { Textarea } from '@/components/ui/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { ImagePicker } from '@/components/profile/image-picker';
import { saveDesignerProfile } from '@/server/actions/profile';
import type { ParsedProfileDraft } from '@/server/actions/onboarding';
import { idleState } from '@/server/actions/types';

export interface DesignerProfileValues {
  avatarUrl: string | null;
  coverUrl: string | null;
  country: string | null;
  languages: string[];
  specializations: string[];
  styles: string[];
  software: string[];
  engines: string[];
  hourlyRate: number | null;
  minBudget: number | null;
  currency: string;
  availability: string;
  bio: string | null;
}

export function DesignerProfileForm({ values }: { values: DesignerProfileValues }) {
  // Черновик из ИИ-разбора накладывается на исходные значения, а форма
  // перемонтируется по `key`: поля неуправляемые, и иначе новые значения
  // в них не попадут.
  const [draft, setDraft] = useState<ParsedProfileDraft | null>(null);

  const current: DesignerProfileValues = draft
    ? {
        ...values,
        specializations: draft.specializations.length ? draft.specializations : values.specializations,
        styles: draft.styles.length ? draft.styles : values.styles,
        software: draft.software.length ? draft.software : values.software,
        engines: draft.engines.length ? draft.engines : values.engines,
        bio: draft.bio || values.bio,
      }
    : values;

  const t = useTranslations('profile');
  const tTax = useTranslations('taxonomy');
  const tRoot = useTranslations();
  const [state, formAction, pending] = useActionState(saveDesignerProfile, idleState);

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tRoot(key) : undefined;
  };

  const labelsFor = (namespace: string, keys: readonly string[]): Record<string, string> =>
    Object.fromEntries(keys.map((key) => [key, tTax(`${namespace}.${key}`)]));

  return (
    <form
      action={formAction}
      // Смена ключа перемонтирует форму с новыми значениями по умолчанию.
      key={draft ? 'ai-draft' : 'original'}
      className="flex flex-col gap-5"
    >
      <ProfileAiImport onApply={setDraft} />

      <Card>
        <CardHeader>
          <CardTitle>{t('designerTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-6">
            <ImagePicker
              name="avatar"
              label={t('avatar')}
              hint={t('imageHint')}
              currentUrl={current.avatarUrl}
            />
            <ImagePicker
              name="cover"
              label={t('cover')}
              hint={t('imageHint')}
              currentUrl={current.coverUrl}
              aspect="cover"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('country')} error={fieldError('country')}>
              {({ id, invalid, describedBy }) => (
                <Input
                  id={id}
                  name="country"
                  defaultValue={current.country ?? ''}
                  maxLength={64}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </Field>

            <div className="flex flex-col gap-1.5">
              <Label>{t('availability')}</Label>
              <Select name="availability" defaultValue={current.availability}>
                {AVAILABILITY_STATES.map((state_) => (
                  <option key={state_} value={state_}>
                    {tTax(`availability.${state_}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('languages')}</Label>
            <ChipSelect
              name="languages"
              options={SPOKEN_LANGUAGES}
              labels={labelsFor('language', SPOKEN_LANGUAGES)}
              defaultValue={current.languages as (typeof SPOKEN_LANGUAGES)[number][]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('specializations')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <ChipSelect
              name="specializations"
              options={SPECIALIZATIONS}
              labels={labelsFor('specialization', SPECIALIZATIONS)}
              defaultValue={current.specializations as (typeof SPECIALIZATIONS)[number][]}
              invalid={Boolean(fieldError('specializations'))}
            />
            {fieldError('specializations') ? (
              <p className="text-sm text-[var(--pf-danger)]">{fieldError('specializations')}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('styles')}</Label>
            <ChipSelect
              name="styles"
              options={ART_STYLES}
              labels={labelsFor('style', ART_STYLES)}
              defaultValue={current.styles as (typeof ART_STYLES)[number][]}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('software')}</Label>
            <TagInput
              name="software"
              presets={SOFTWARE_PRESETS}
              defaultValue={current.software}
              placeholder={t('softwareHint')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('engines')}</Label>
            <TagInput
              name="engines"
              presets={ENGINE_PRESETS}
              defaultValue={current.engines}
              max={10}
              placeholder={t('enginesHint')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('hourlyRate')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('hourlyRate')} error={fieldError('hourlyRate')}>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  name="hourlyRate"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  defaultValue={current.hourlyRate ?? ''}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field label={t('minBudget')} error={fieldError('minBudget')}>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  name="minBudget"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  defaultValue={current.minBudget ?? ''}
                  invalid={invalid}
                />
              )}
            </Field>

            <div className="flex flex-col gap-1.5">
              <Label>{t('currency')}</Label>
              <Select name="currency" defaultValue={current.currency}>
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <p className="text-xs text-fg-muted">{t('rateHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('bio')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Textarea
            name="bio"
            defaultValue={current.bio ?? ''}
            maxLength={2000}
            placeholder={t('bioHint')}
            invalid={Boolean(fieldError('bio'))}
          />
          {fieldError('bio') ? (
            <p className="text-sm text-[var(--pf-danger)]">{fieldError('bio')}</p>
          ) : null}
        </CardContent>
      </Card>

      <FormMessage state={state} />

      <Button type="submit" size="lg" loading={pending} className="sm:w-fit">
        {t('save')}
      </Button>
    </form>
  );
}

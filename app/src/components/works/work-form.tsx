'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import {
  ART_STYLES,
  ASSET_TYPES,
  ENGINE_PRESETS,
  FILE_FORMAT_PRESETS,
  SOFTWARE_PRESETS,
  WORK_VISIBILITIES,
} from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChipSelect } from '@/components/ui/chip-select';
import { Field, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { Textarea } from '@/components/ui/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { MediaUploader, type UploadedItem } from '@/components/works/media-uploader';
import { saveWork } from '@/server/actions/works';
import { idleState } from '@/server/actions/types';

export interface WorkFormValues {
  id: string;
  title: string;
  description: string;
  assetType: string | null;
  styles: string[];
  software: string[];
  engines: string[];
  polycount: number | null;
  textureInfo: string;
  formats: string[];
  timeSpentHours: number | null;
  visibility: string;
  media: UploadedItem[];
}

export function WorkForm({
  values,
  maxImages,
  isEdit,
}: {
  values: WorkFormValues;
  maxImages: number;
  isEdit: boolean;
}) {
  const t = useTranslations('works.form');
  const tTax = useTranslations('taxonomy');
  const tRoot = useTranslations();

  const [state, formAction, pending] = useActionState(saveWork, idleState);
  useActionRedirect(state);

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tRoot(key) : undefined;
  };

  const styleLabels = Object.fromEntries(
    ART_STYLES.map((style) => [style, tTax(`style.${style}`)]),
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="workId" value={values.id} />

      <Card>
        <CardHeader>
          <CardTitle>{t('media')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <MediaUploader workId={values.id} initialItems={values.media} maxItems={maxImages} />
          {fieldError('mediaIds') ? (
            <p className="text-sm text-[var(--pf-danger)]">{fieldError('mediaIds')}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <Field label={t('title')} hint={t('titleHint')} error={fieldError('title')} required>
            {({ id, invalid, describedBy }) => (
              <Input
                id={id}
                name="title"
                required
                defaultValue={values.title}
                maxLength={120}
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <Label>{t('description')}</Label>
            <Textarea
              name="description"
              defaultValue={values.description}
              maxLength={5000}
              placeholder={t('descriptionHint')}
              invalid={Boolean(fieldError('description'))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('assetType')}</Label>
              <Select name="assetType" defaultValue={values.assetType ?? ''}>
                <option value="">—</option>
                {ASSET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tTax(`assetType.${type}`)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('visibility')}</Label>
              <Select name="visibility" defaultValue={values.visibility}>
                {WORK_VISIBILITIES.map((visibility) => (
                  <option key={visibility} value={visibility}>
                    {tTax(`visibility.${visibility}`)}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-fg-muted">{t('visibilityHint')}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('styles')}</Label>
            <ChipSelect
              name="styles"
              options={ART_STYLES}
              labels={styleLabels}
              defaultValue={values.styles as (typeof ART_STYLES)[number][]}
              max={6}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('software')}</Label>
              <TagInput
                name="software"
                presets={SOFTWARE_PRESETS}
                defaultValue={values.software}
                max={10}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('engines')}</Label>
              <TagInput
                name="engines"
                presets={ENGINE_PRESETS}
                defaultValue={values.engines}
                max={6}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('tech')}</CardTitle>
          <p className="text-sm text-fg-muted">{t('techHint')}</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t('polycount')} error={fieldError('polycount')}>
            {({ id, invalid }) => (
              <Input
                id={id}
                name="polycount"
                type="number"
                min={0}
                inputMode="numeric"
                className="font-mono"
                defaultValue={values.polycount ?? ''}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label={t('textureInfo')} hint={t('textureHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                name="textureInfo"
                defaultValue={values.textureInfo}
                maxLength={200}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <Label>{t('formats')}</Label>
            <TagInput
              name="formats"
              presets={FILE_FORMAT_PRESETS}
              defaultValue={values.formats}
              max={10}
            />
          </div>

          <Field label={t('timeSpent')}>
            {({ id }) => (
              <Input
                id={id}
                name="timeSpentHours"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={values.timeSpentHours ?? ''}
              />
            )}
          </Field>
        </CardContent>
      </Card>

      <FormMessage state={state} />

      <Button type="submit" size="lg" loading={pending} className="sm:w-fit">
        {isEdit ? t('submitEdit') : t('submit')}
      </Button>
    </form>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { CUSTOMER_TYPES } from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { Textarea } from '@/components/ui/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { ImagePicker } from '@/components/profile/image-picker';
import { saveCustomerProfile } from '@/server/actions/profile';
import { idleState } from '@/server/actions/types';

export interface CustomerProfileValues {
  avatarUrl: string | null;
  displayName: string;
  type: string;
  projectLinks: string[];
  bio: string | null;
}

export function CustomerProfileForm({ values }: { values: CustomerProfileValues }) {
  const t = useTranslations('profile');
  const tTax = useTranslations('taxonomy');
  const tRoot = useTranslations();
  const [state, formAction, pending] = useActionState(saveCustomerProfile, idleState);

  const fieldError = (name: string): string | undefined => {
    const key = state.fieldErrors?.[name];
    return key ? tRoot(key) : undefined;
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{t('customerTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ImagePicker
            name="avatar"
            label={t('avatar')}
            hint={t('imageHint')}
            currentUrl={values.avatarUrl}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('displayName')} error={fieldError('displayName')} required>
              {({ id, invalid, describedBy }) => (
                <Input
                  id={id}
                  name="displayName"
                  required
                  defaultValue={values.displayName}
                  maxLength={64}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </Field>

            <div className="flex flex-col gap-1.5">
              <Label>{t('type')}</Label>
              <Select name="type" defaultValue={values.type}>
                {CUSTOMER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tTax(`customerType.${type}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('projectLinks')}</Label>
            <TagInput
              name="projectLinks"
              defaultValue={values.projectLinks}
              max={5}
              placeholder={t('projectLinksHint')}
            />
            {fieldError('projectLinks') ? (
              <p className="text-sm text-[var(--pf-danger)]">{fieldError('projectLinks')}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('bio')}</Label>
            <Textarea
              name="bio"
              defaultValue={values.bio ?? ''}
              maxLength={2000}
              placeholder={t('bioHint')}
              invalid={Boolean(fieldError('bio'))}
            />
          </div>
        </CardContent>
      </Card>

      <FormMessage state={state} />

      <Button type="submit" size="lg" loading={pending} className="sm:w-fit">
        {t('save')}
      </Button>
    </form>
  );
}

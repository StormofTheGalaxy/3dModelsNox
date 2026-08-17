'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';
import {
  customerProfileSchema,
  designerProfileSchema,
  onboardingSchema,
} from '@polyforge/shared';

import { getCurrentUser } from '../auth/session';
import { storeProfileImage } from '../media';
import { checkRateLimit } from '../ratelimit';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom, jsonField, numberField, stringListField } from './form';

/**
 * Заполнение профилей (§4.2). Профиль создаётся при первом сохранении —
 * отдельного шага «завести профиль» нет.
 */

export async function completeOnboarding(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  const parsed = onboardingSchema.safeParse({ intent: formData.get('intent') });
  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const { intent } = parsed.data;
  const wantsDesigner = intent === 'designer' || intent === 'both';
  const wantsCustomer = intent === 'customer' || intent === 'both';

  // Пустые профили заводим сразу: так дашборд и переключатель роли знают,
  // какие контексты у пользователя вообще есть.
  if (wantsDesigner) {
    await prisma.designerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  }

  if (wantsCustomer) {
    await prisma.customerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, displayName: user.nickname },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastRoleContext: wantsDesigner ? 'designer' : 'customer' },
  });

  return successState({
    redirectTo: wantsDesigner ? '/profile/designer' : '/profile/customer',
  });
}

export async function saveDesignerProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  const parsed = designerProfileSchema.safeParse({
    country: formData.get('country') ?? '',
    languages: jsonField(formData.get('languages')),
    specializations: jsonField(formData.get('specializations')),
    styles: jsonField(formData.get('styles')),
    software: stringListField(formData.get('software')),
    engines: stringListField(formData.get('engines')),
    hourlyRate: numberField(formData.get('hourlyRate')),
    minBudget: numberField(formData.get('minBudget')),
    currency: formData.get('currency') ?? 'USD',
    availability: formData.get('availability') ?? 'open',
    bio: formData.get('bio') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const input = parsed.data;
  const images = await readProfileImages(formData, user.id);
  if ('error' in images) return images.error;

  const data = {
    country: input.country || null,
    languages: input.languages,
    specializations: input.specializations,
    styles: input.styles,
    software: input.software,
    engines: input.engines,
    hourlyRate: input.hourlyRate,
    minBudget: input.minBudget,
    currency: input.currency,
    availability: input.availability,
    bio: input.bio || null,
    ...(images.avatarUrl ? { avatarUrl: images.avatarUrl } : {}),
    ...(images.coverUrl ? { coverUrl: images.coverUrl } : {}),
    // Профиль считается заполненным, когда указана хотя бы специализация:
    // только с ней он полезен в каталоге и матчинге.
    completedAt: new Date(),
  };

  await prisma.designerProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  revalidatePath(`/designers/${user.nickname}`);

  return successState({ message: 'settings.saved' });
}

export async function saveCustomerProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  const parsed = customerProfileSchema.safeParse({
    displayName: formData.get('displayName') ?? '',
    type: formData.get('type') ?? 'indie',
    projectLinks: stringListField(formData.get('projectLinks')),
    bio: formData.get('bio') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const input = parsed.data;
  const images = await readProfileImages(formData, user.id, { coverAllowed: false });
  if ('error' in images) return images.error;

  const data = {
    displayName: input.displayName,
    type: input.type,
    projectLinks: input.projectLinks,
    bio: input.bio || null,
    ...(images.avatarUrl ? { avatarUrl: images.avatarUrl } : {}),
    completedAt: new Date(),
  };

  await prisma.customerProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  revalidatePath(`/customers/${user.nickname}`);

  return successState({ message: 'settings.saved' });
}

/** Аватар и обложка приходят той же формой — обрабатываем их одинаково. */
async function readProfileImages(
  formData: FormData,
  userId: string,
  options: { coverAllowed?: boolean } = {},
): Promise<{ avatarUrl?: string; coverUrl?: string } | { error: ActionState }> {
  const limit = await checkRateLimit('upload', userId);
  const result: { avatarUrl?: string; coverUrl?: string } = {};

  const avatar = formData.get('avatar');
  const cover = options.coverAllowed === false ? null : formData.get('cover');

  const hasUpload =
    (avatar instanceof File && avatar.size > 0) || (cover instanceof File && cover.size > 0);

  if (hasUpload && !limit.allowed) {
    return {
      error: errorState('errors.rateLimited', { values: { seconds: limit.retryAfterSeconds } }),
    };
  }

  if (avatar instanceof File && avatar.size > 0) {
    const uploaded = await storeProfileImage(avatar, userId, 'avatar');
    if (!uploaded.ok) {
      return { error: errorState(uploaded.error, { values: uploaded.values }) };
    }
    result.avatarUrl = uploaded.url;
  }

  if (cover instanceof File && cover.size > 0) {
    const uploaded = await storeProfileImage(cover, userId, 'cover');
    if (!uploaded.ok) {
      return { error: errorState(uploaded.error, { values: uploaded.values }) };
    }
    result.coverUrl = uploaded.url;
  }

  return result;
}

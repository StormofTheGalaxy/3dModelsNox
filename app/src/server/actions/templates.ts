'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@polyforge/db';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { publicTemplatesEnabled } from '../templates';

/**
 * Публикация личных шаблонов ТЗ (§4.4, post-MVP №6).
 *
 * Публикация обратима автором и снимаема модератором. Системные пресеты
 * этими действиями не трогаются: они принадлежат платформе, а не человеку.
 */

export async function publishTemplate(
  templateId: string,
  isPublic: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  if (!(await publicTemplatesEnabled())) {
    return { ok: false, error: 'errors.template.disabled' };
  }

  const template = await prisma.briefTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, ownerId: true, isSystem: true, hiddenAt: true, publishedAt: true },
  });

  if (!template || template.isSystem || template.ownerId !== user.id) {
    return { ok: false, error: 'errors.forbidden' };
  }

  // Снятый модератором шаблон автор обратно не публикует: иначе кнопка
  // «опубликовать» отменяет решение модерации.
  if (isPublic && template.hiddenAt) return { ok: false, error: 'errors.template.hidden' };

  await prisma.briefTemplate.update({
    where: { id: templateId },
    data: {
      isPublic,
      // Дата первой публикации не переписывается при повторной: по ней
      // сортируется каталог, и «новым» шаблон должен быть один раз.
      publishedAt: isPublic ? (template.publishedAt ?? new Date()) : template.publishedAt,
    },
  });

  await writeAuditLog({
    action: isPublic ? 'template.published' : 'template.unpublished',
    actorId: user.id,
    targetType: 'template',
    targetId: templateId,
  });

  revalidatePath('/briefs/new');
  revalidatePath('/templates');

  return { ok: true };
}

export async function renameTemplate(
  templateId: string,
  title: string,
  description: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const clean = title.trim();
  if (clean.length < 3 || clean.length > 140) {
    return { ok: false, error: 'errors.template.badTitle' };
  }

  const updated = await prisma.briefTemplate.updateMany({
    where: { id: templateId, ownerId: user.id, isSystem: false },
    data: { title: clean, description: description.trim().slice(0, 300) || null },
  });

  if (updated.count === 0) return { ok: false, error: 'errors.forbidden' };

  revalidatePath('/templates');
  return { ok: true };
}

export async function deleteTemplate(templateId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const deleted = await prisma.briefTemplate.deleteMany({
    where: { id: templateId, ownerId: user.id, isSystem: false },
  });

  if (deleted.count === 0) return { ok: false, error: 'errors.forbidden' };

  revalidatePath('/templates');
  return { ok: true };
}

/** Снятие публичного шаблона модератором. У автора он остаётся личным. */
export async function hideTemplate(templateId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!['moderator', 'arbiter', 'admin'].includes(user.role)) {
    return { ok: false, error: 'errors.forbidden' };
  }

  const template = await prisma.briefTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, isSystem: true, ownerId: true },
  });

  if (!template || template.isSystem) return { ok: false, error: 'errors.forbidden' };

  await prisma.briefTemplate.update({
    where: { id: templateId },
    data: { isPublic: false, hiddenAt: new Date(), hiddenById: user.id },
  });

  await writeAuditLog({
    action: 'template.hidden',
    actorId: user.id,
    targetType: 'template',
    targetId: templateId,
    payload: { ownerId: template.ownerId },
  });

  revalidatePath('/templates');
  return { ok: true };
}

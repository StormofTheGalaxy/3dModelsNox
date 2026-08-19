'use server';

import { revalidatePath } from 'next/cache';

import { prisma, type OrganizationKind, type OrganizationRole } from '@polyforge/db';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { notify } from '../notifications';
import {
  canManageOrganization,
  organizationsEnabled,
  roleIn,
  uniqueSlug,
} from '../organizations';
import { checkRateLimit } from '../ratelimit';

/**
 * Команды и студии (§1.4, post-MVP №7).
 *
 * Организация — способ вести общие ТЗ и заказы, а не юридическое лицо:
 * стороной сделки, получателем оплат и носителем репутации остаётся
 * человек (§1.2.1, §1.2.3).
 */

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string; values?: Record<string, string | number> };

const KINDS: OrganizationKind[] = ['studio', 'customer_team'];

export async function createOrganization(
  name: string,
  kind: string,
): Promise<Result<{ slug: string }>> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  if (!(await organizationsEnabled())) return { ok: false, error: 'errors.organization.disabled' };

  const title = name.trim();
  if (title.length < 2 || title.length > 80) {
    return { ok: false, error: 'errors.organization.badName' };
  }

  if (!KINDS.includes(kind as OrganizationKind)) {
    return { ok: false, error: 'errors.generic' };
  }

  const limit = await checkRateLimit('organization', user.id);
  if (!limit.allowed) {
    return { ok: false, error: 'errors.rateLimited', values: { seconds: limit.retryAfterSeconds } };
  }

  const slug = await uniqueSlug(title);

  const organization = await prisma.organization.create({
    data: {
      slug,
      name: title,
      kind: kind as OrganizationKind,
      ownerId: user.id,
      // Создатель сразу принятый участник: приглашать самого себя незачем.
      members: { create: { userId: user.id, role: 'owner', acceptedAt: new Date() } },
    },
    select: { id: true, slug: true },
  });

  await writeAuditLog({
    action: 'organization.created',
    actorId: user.id,
    targetType: 'organization',
    targetId: organization.id,
    payload: { kind, slug },
  });

  revalidatePath('/teams');

  return { ok: true, slug: organization.slug };
}

export async function updateOrganization(
  organizationId: string,
  input: { name?: string; bio?: string; website?: string },
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await canManageOrganization(organizationId, user.id))) {
    return { ok: false, error: 'errors.forbidden' };
  }

  const name = input.name?.trim();
  if (name !== undefined && (name.length < 2 || name.length > 80)) {
    return { ok: false, error: 'errors.organization.badName' };
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(name === undefined ? {} : { name }),
      ...(input.bio === undefined ? {} : { bio: input.bio.trim().slice(0, 1000) || null }),
      ...(input.website === undefined
        ? {}
        : { website: input.website.trim().slice(0, 200) || null }),
    },
  });

  revalidatePath('/teams');
  return { ok: true };
}

/** Приглашение по нику. Права появляются только после принятия. */
export async function inviteMember(
  organizationId: string,
  nickname: string,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  if (!(await canManageOrganization(organizationId, user.id))) {
    return { ok: false, error: 'errors.forbidden' };
  }

  const invitee = await prisma.user.findUnique({
    where: { nicknameLower: nickname.trim().toLowerCase() },
    select: { id: true, status: true },
  });

  if (!invitee || invitee.status !== 'active') {
    return { ok: false, error: 'errors.organization.userNotFound' };
  }

  const existing = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: invitee.id } },
    select: { id: true, acceptedAt: true },
  });

  // Повторное приглашение уже приглашённого — не ошибка, а ничего.
  if (existing) return { ok: true };

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  await prisma.organizationMember.create({
    data: { organizationId, userId: invitee.id, role: 'member', invitedById: user.id },
  });

  await notify({
    userId: invitee.id,
    type: 'organization_invite',
    payload: { organization: organization?.name ?? '', inviter: user.nickname },
    link: '/teams',
    push: true,
  });

  await writeAuditLog({
    action: 'organization.member_invited',
    actorId: user.id,
    targetType: 'organization',
    targetId: organizationId,
    payload: { userId: invitee.id },
  });

  revalidatePath('/teams');
  return { ok: true };
}

export async function respondToInvite(
  organizationId: string,
  accept: boolean,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    select: { id: true, acceptedAt: true },
  });

  if (!member || member.acceptedAt) return { ok: false, error: 'errors.forbidden' };

  if (accept) {
    await prisma.organizationMember.update({
      where: { id: member.id },
      data: { acceptedAt: new Date() },
    });

    await writeAuditLog({
      action: 'organization.member_joined',
      actorId: user.id,
      targetType: 'organization',
      targetId: organizationId,
    });
  } else {
    await prisma.organizationMember.delete({ where: { id: member.id } });
  }

  revalidatePath('/teams');
  return { ok: true };
}

export async function setMemberRole(
  organizationId: string,
  userId: string,
  role: string,
): Promise<Result> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: 'errors.forbidden' };

  // Роли раздаёт только владелец: менеджер, назначающий менеджеров, за пару
  // шагов превращает приглашение в захват команды.
  if ((await roleIn(organizationId, actor.id)) !== 'owner') {
    return { ok: false, error: 'errors.forbidden' };
  }

  if (!['manager', 'member'].includes(role)) return { ok: false, error: 'errors.generic' };

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });

  // Владелец у организации один, и роль ему не меняют — иначе команда
  // остаётся без того, кто может раздавать права.
  if (organization?.ownerId === userId) return { ok: false, error: 'errors.organization.ownerRole' };

  const updated = await prisma.organizationMember.updateMany({
    where: { organizationId, userId, acceptedAt: { not: null } },
    data: { role: role as OrganizationRole },
  });

  if (updated.count === 0) return { ok: false, error: 'errors.notFound' };

  await writeAuditLog({
    action: 'organization.role_changed',
    actorId: actor.id,
    targetType: 'organization',
    targetId: organizationId,
    payload: { userId, role },
  });

  revalidatePath('/teams');
  return { ok: true };
}

/** Исключение участника владельцем или менеджером, либо выход по своей воле. */
export async function removeMember(organizationId: string, userId: string): Promise<Result> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: 'errors.forbidden' };

  const leaving = actor.id === userId;
  if (!leaving && !(await canManageOrganization(organizationId, actor.id))) {
    return { ok: false, error: 'errors.forbidden' };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });

  // Владелец не уходит и не исключается: сначала передача организации.
  if (organization?.ownerId === userId) {
    return { ok: false, error: 'errors.organization.ownerLeave' };
  }

  await prisma.organizationMember.deleteMany({ where: { organizationId, userId } });

  await writeAuditLog({
    action: 'organization.member_removed',
    actorId: actor.id,
    targetType: 'organization',
    targetId: organizationId,
    payload: { userId, leaving },
  });

  revalidatePath('/teams');
  return { ok: true };
}

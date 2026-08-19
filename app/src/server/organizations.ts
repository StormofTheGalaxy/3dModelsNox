import 'server-only';

import { prisma, type OrganizationKind, type OrganizationRole } from '@polyforge/db';

import { getSetting } from './settings';

/**
 * Команды, студии и менеджеры заказчика (§1.4, post-MVP №7).
 *
 * Главное здесь — не экраны, а один предикат прав. Проверок «это моё ТЗ»
 * в коде два десятка, и если каждая начнёт по-своему учитывать организацию,
 * рано или поздно одна из них пропустит чужого. Поэтому все они ходят через
 * `managedOrganizationIds` и производные от него функции.
 *
 * Организация не становится стороной сделки: платежи и репутация остаются
 * персональными (§1.2.1, §1.2.3), а команда — способ вести общие ТЗ и
 * заказы вдвоём и втроём.
 */

/** Роли, дающие право распоряжаться общими ТЗ и заказами. */
const MANAGING_ROLES: OrganizationRole[] = ['owner', 'manager'];

export async function organizationsEnabled(): Promise<boolean> {
  return getSetting('feature_organizations');
}

export interface MembershipView {
  organizationId: string;
  slug: string;
  name: string;
  kind: OrganizationKind;
  role: OrganizationRole;
  accepted: boolean;
}

/**
 * Организации, от имени которых пользователь вправе действовать.
 *
 * Приглашение без принятия прав не даёт: до `acceptedAt` человек в списке
 * участников есть, а распоряжаться ничем не может.
 */
export async function managedOrganizationIds(userId: string): Promise<string[]> {
  if (!(await organizationsEnabled())) return [];

  const rows = await prisma.organizationMember.findMany({
    where: { userId, acceptedAt: { not: null }, role: { in: MANAGING_ROLES } },
    select: { organizationId: true },
  });

  return rows.map((row) => row.organizationId);
}

/** Организации, от имени которых можно завести ТЗ или заказ. */
export async function managedOrganizations(
  userId: string,
): Promise<{ id: string; name: string; kind: OrganizationKind }[]> {
  if (!(await organizationsEnabled())) return [];

  const rows = await prisma.organizationMember.findMany({
    where: { userId, acceptedAt: { not: null }, role: { in: MANAGING_ROLES } },
    orderBy: { invitedAt: 'asc' },
    select: { organization: { select: { id: true, name: true, kind: true } } },
  });

  return rows.map((row) => row.organization);
}

/** Все членства пользователя, включая непринятые приглашения. */
export async function listMemberships(userId: string): Promise<MembershipView[]> {
  const rows = await prisma.organizationMember.findMany({
    where: { userId },
    orderBy: [{ acceptedAt: 'asc' }, { invitedAt: 'desc' }],
    select: {
      role: true,
      acceptedAt: true,
      organization: { select: { id: true, slug: true, name: true, kind: true } },
    },
  });

  return rows.map((row) => ({
    organizationId: row.organization.id,
    slug: row.organization.slug,
    name: row.organization.name,
    kind: row.organization.kind,
    role: row.role,
    accepted: row.acceptedAt !== null,
  }));
}

/** Роль пользователя в организации; `null` — не участник или не принял. */
export async function roleIn(
  organizationId: string,
  userId: string,
): Promise<OrganizationRole | null> {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true, acceptedAt: true },
  });

  return member?.acceptedAt ? member.role : null;
}

export async function canManageOrganization(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const role = await roleIn(organizationId, userId);
  return role !== null && MANAGING_ROLES.includes(role);
}

/**
 * Условие «принадлежит мне» для ТЗ и заказов в терминах Prisma.
 *
 * Возвращает `OR` из личного владения и общего: подставляется в `where`
 * там, где раньше стояло простое сравнение с userId.
 */
export function ownedBy(userId: string, organizationIds: string[]) {
  return organizationIds.length > 0
    ? { OR: [{ ownerId: userId }, { organizationId: { in: organizationIds } }] }
    : { ownerId: userId };
}

/** То же для заказа: там владелец зовётся customerId. */
export function orderedBy(userId: string, organizationIds: string[]) {
  return organizationIds.length > 0
    ? { OR: [{ customerId: userId }, { organizationId: { in: organizationIds } }] }
    : { customerId: userId };
}

/** Проверка уже загруженной записи — без второго запроса в базу. */
export function managesRecord(
  record: { ownerId?: string; customerId?: string; organizationId?: string | null },
  userId: string,
  organizationIds: string[],
): boolean {
  const owner = record.ownerId ?? record.customerId;
  if (owner === userId) return true;

  return record.organizationId !== null && record.organizationId !== undefined
    ? organizationIds.includes(record.organizationId)
    : false;
}

/** То же для ТЗ: у него владелец зовётся ownerId. */
export async function managesBrief(
  brief: { ownerId: string; organizationId: string | null },
  userId: string,
): Promise<boolean> {
  if (brief.ownerId === userId) return true;

  const { organizationId } = brief;
  if (organizationId === null) return false;

  return (await managedOrganizationIds(userId)).includes(organizationId);
}

/**
 * Та же проверка для уже загруженного заказа, но с подгрузкой организаций.
 *
 * Список тянется только тогда, когда заказ действительно командный: у
 * личных заказов, а их большинство, лишнего запроса не появляется.
 */
export async function managesOrder(
  order: { customerId: string; organizationId: string | null },
  userId: string,
): Promise<boolean> {
  if (order.customerId === userId) return true;

  const { organizationId } = order;
  if (organizationId === null) return false;

  return (await managedOrganizationIds(userId)).includes(organizationId);
}

export interface OrganizationView {
  id: string;
  slug: string;
  name: string;
  kind: OrganizationKind;
  bio: string | null;
  avatarUrl: string | null;
  website: string | null;
  ownerId: string;
  members: {
    userId: string;
    nickname: string;
    avatarUrl: string | null;
    role: OrganizationRole;
    accepted: boolean;
  }[];
}

export async function getOrganizationBySlug(slug: string): Promise<OrganizationView | null> {
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      bio: true,
      avatarUrl: true,
      website: true,
      ownerId: true,
      members: {
        orderBy: [{ role: 'asc' }, { invitedAt: 'asc' }],
        select: {
          userId: true,
          role: true,
          acceptedAt: true,
          user: {
            select: {
              nickname: true,
              designerProfile: { select: { avatarUrl: true } },
              customerProfile: { select: { avatarUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!organization) return null;

  return {
    ...organization,
    members: organization.members.map((member) => ({
      userId: member.userId,
      nickname: member.user.nickname,
      avatarUrl:
        member.user.designerProfile?.avatarUrl ?? member.user.customerProfile?.avatarUrl ?? null,
      role: member.role,
      accepted: member.acceptedAt !== null,
    })),
  };
}

/**
 * Slug из названия. Латиница и цифры, кириллица транслитерируется: адрес
 * студии должен читаться и набираться в любой раскладке.
 */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(name: string): string {
  const base = [...name.toLowerCase()]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);

  return base || 'team';
}

/** Свободный slug: занятые получают числовой хвост. */
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!taken) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

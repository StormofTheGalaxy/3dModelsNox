'use server';

import { revalidatePath } from 'next/cache';

import { prisma, type Prisma } from '@polyforge/db';
import {
  orderFilterSchema,
  orderPublishSchema,
  parseBriefSections,
  savedFilterSchema,
} from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { notify } from '../notifications';
import { buildSearchText, countActiveOrders } from '../orders';
import { getSetting } from '../settings';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Заказы (§4.5): публикация из ТЗ, продление, отмена, приглашения.
 */

/** Публикация заказа. ТЗ становится активным, если было черновиком. */
export async function publishOrder(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  const parsed = orderPublishSchema.safeParse({
    briefId: formData.get('briefId') ?? '',
    title: formData.get('title') ?? '',
    budgetMode: formData.get('budgetMode') ?? 'open',
    budgetAmount: formData.get('budgetAmount')
      ? Number(formData.get('budgetAmount'))
      : null,
    budgetCurrency: formData.get('budgetCurrency') ?? 'USD',
    deadline: formData.get('deadline') || null,
    workMode: formData.get('workMode') || 'fixed',
    auctionMode: formData.get('auctionMode') || 'open_reverse',
    auctionStartPrice: formData.get('auctionStartPrice')
      ? Number(formData.get('auctionStartPrice'))
      : null,
    auctionEndsAt: formData.get('auctionEndsAt') || null,
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const input = parsed.data;

  const brief = await prisma.brief.findUnique({
    where: { id: input.briefId },
    select: { id: true, ownerId: true, status: true, sections: true, title: true },
  });

  if (!brief || brief.ownerId !== user.id) return errorState('errors.forbidden');
  if (brief.status === 'archived') return errorState('errors.order.briefArchived');

  // Лимит активных заказов — настройка платформы (§4.5).
  const [limit, active, autoArchiveDays] = await Promise.all([
    getSetting('max_active_orders_per_customer'),
    countActiveOrders(user.id),
    getSetting('order_autoarchive_days'),
  ]);

  if (active >= limit) {
    return errorState('errors.order.tooManyActive', { values: { limit } });
  }

  // Торги — post-MVP за флагом (§1.2.2). Форма их не покажет, но проверка
  // нужна и здесь: `workMode` приходит из FormData.
  const auctionOn = await getSetting('feature_auction');
  const wantsAuction = input.workMode === 'auction';

  if (wantsAuction && !auctionOn) return errorState('errors.auction.disabled');

  let auctionEndsAt: Date | null = null;

  if (wantsAuction && input.auctionEndsAt) {
    const [minHours, maxDays] = await Promise.all([
      getSetting('auction_min_duration_hours'),
      getSetting('auction_max_duration_days'),
    ]);

    auctionEndsAt = new Date(input.auctionEndsAt);
    if (Number.isNaN(auctionEndsAt.getTime())) {
      return errorState('errors.generic', { fieldErrors: { auctionEndsAt: 'errors.auction.invalidEndsAt' } });
    }

    const hours = (auctionEndsAt.getTime() - Date.now()) / (60 * 60 * 1000);
    if (hours < minHours) {
      return errorState('errors.auction.tooShort', { values: { hours: minHours } });
    }
    if (hours > maxDays * 24) {
      return errorState('errors.auction.tooLong', { values: { days: maxDays } });
    }
  }

  const sections = parseBriefSections(brief.sections);
  const now = new Date();

  const order = await prisma.order.create({
    data: {
      customerId: user.id,
      briefId: brief.id,
      title: input.title,
      status: 'published',
      workMode: wantsAuction ? 'auction' : 'fixed',
      // Денормализуем из ТЗ на момент публикации: витрина читает эти поля.
      assetType: sections.general.assetType,
      styles: sections.style.styleTags,
      engine: sections.tech.engine || null,
      platform: sections.tech.platform,
      budgetMode: input.budgetMode,
      budgetAmount: input.budgetMode === 'fixed' ? input.budgetAmount : null,
      budgetCurrency: input.budgetCurrency,
      deadline: input.deadline ? new Date(input.deadline) : null,
      previewUrl: sections.style.references.find((reference) => reference.url)?.url ?? null,
      searchText: buildSearchText([
        input.title,
        brief.title,
        sections.general.description,
        sections.tech.engine,
        sections.style.moodboardNote,
        ...sections.style.styleTags,
        ...sections.tech.formats,
      ]),
      publishedAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + autoArchiveDays * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });

  if (wantsAuction) {
    await prisma.auction.create({
      data: {
        orderId: order.id,
        mode: input.auctionMode,
        startPrice: input.auctionStartPrice,
        currency: input.budgetCurrency,
        endsAt: auctionEndsAt,
        // В открытом режиме ставки видны с первой секунды; в закрытом
        // вскрытие наступает по дедлайну и ставит эту метку само.
        revealedAt: input.auctionMode === 'open_reverse' ? now : null,
      },
    });

    await writeAuditLog({
      action: 'auction.opened',
      actorId: user.id,
      targetType: 'order',
      targetId: order.id,
      payload: { mode: input.auctionMode, endsAt: auctionEndsAt?.toISOString() ?? null },
    });
  }

  // Опубликованный заказ означает, что ТЗ по нему уже показывают наружу.
  if (brief.status === 'draft') {
    await prisma.brief.update({ where: { id: brief.id }, data: { status: 'active' } });
  }

  await prisma.customerProfile
    .update({ where: { userId: user.id }, data: { ordersCreated: { increment: 1 } } })
    .catch(() => undefined);

  await writeAuditLog({
    action: 'order.published',
    actorId: user.id,
    targetType: 'order',
    targetId: order.id,
    payload: { briefId: brief.id },
  });

  revalidatePath('/orders');

  return successState({ message: 'settings.saved', redirectTo: `/orders/${order.id}` });
}

/** Продление заказа в один клик перед автоархивом (§4.5). */
export async function extendOrder(orderId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, status: true },
  });

  if (!order || order.customerId !== user.id) return { ok: false };
  if (order.status !== 'published') return { ok: false };

  const days = await getSetting('order_autoarchive_days');
  const now = new Date();

  await prisma.order.update({
    where: { id: orderId },
    data: {
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
    },
  });

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function cancelOrder(orderId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, status: true },
  });

  if (!order || order.customerId !== user.id) return { ok: false };
  // Заказ в работе отменяется через сделку, а не с витрины (фаза 4).
  if (order.status === 'in_progress' || order.status === 'completed') return { ok: false };

  await prisma.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });

  await writeAuditLog({
    action: 'order.cancelled',
    actorId: user.id,
    targetType: 'order',
    targetId: orderId,
  });

  revalidatePath('/orders');
  return { ok: true };
}

/**
 * Приглашение дизайнера в заказ (§4.5). Приглашённый видит метку на карточке,
 * а его отклик поднимается в списке заказчика.
 */
export async function inviteDesigner(
  orderId: string,
  designerNickname: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { ok: false, error: 'errors.forbidden' };

  const [order, designer] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, status: true, title: true, invitedDesignerIds: true },
    }),
    prisma.user.findUnique({
      where: { nicknameLower: designerNickname.toLowerCase() },
      select: { id: true, status: true, designerProfile: { select: { id: true } } },
    }),
  ]);

  if (!order || order.customerId !== user.id) return { ok: false, error: 'errors.forbidden' };
  if (order.status !== 'published') return { ok: false, error: 'errors.order.notPublished' };
  if (!designer?.designerProfile || designer.status !== 'active') {
    return { ok: false, error: 'errors.order.designerNotFound' };
  }
  if (order.invitedDesignerIds.includes(designer.id)) {
    return { ok: true };
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { invitedDesignerIds: { push: designer.id } },
  });

  await notify({
    userId: designer.id,
    type: 'order_new_match',
    payload: { orderTitle: order.title, invited: true },
    link: `/orders/${orderId}`,
    withEmail: true,
  });

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// ── Сохранённые фильтры ─────────────────────────────────────────────────────

export async function saveFilter(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  let params: unknown = {};
  try {
    params = JSON.parse(String(formData.get('params') ?? '{}'));
  } catch {
    params = {};
  }

  const parsed = savedFilterSchema.safeParse({
    title: formData.get('title') ?? '',
    params: orderFilterSchema.partial().parse(params),
    notifyEmail: formData.get('notifyEmail') !== 'off',
    notifyInApp: formData.get('notifyInApp') !== 'off',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  await prisma.savedFilter.create({
    data: {
      userId: user.id,
      title: parsed.data.title,
      params: parsed.data.params as Prisma.InputJsonValue,
      notifyEmail: parsed.data.notifyEmail,
      notifyInApp: parsed.data.notifyInApp,
    },
  });

  revalidatePath('/orders');

  return successState({ message: 'orders.savedFilters.created' });
}

export async function deleteSavedFilter(filterId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const result = await prisma.savedFilter.deleteMany({ where: { id: filterId, userId: user.id } });

  revalidatePath('/orders');
  return { ok: result.count === 1 };
}

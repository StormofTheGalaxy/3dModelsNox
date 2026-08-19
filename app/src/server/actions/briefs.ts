'use server';

import { revalidatePath } from 'next/cache';

import { prisma, type Prisma } from '@polyforge/db';
import {
  briefSaveSchema,
  briefTitleSchema,
  parseBriefSections,
  emptyBriefSections,
  type BriefSections,
} from '@polyforge/shared';

import { writeAuditLog } from '../audit';
import { getCurrentUser } from '../auth/session';
import { generateShareToken, getOwnBrief } from '../briefs';
import { enqueueBriefPdf } from '../queue';
import { errorState, successState, type ActionState } from './types';
import { fieldErrorsFrom } from './form';

/**
 * Конструктор ТЗ (§4.4).
 *
 * Автосохранение обновляет черновик, но не пишет версию: версия — это
 * осознанный шаг пользователя («Сохранить»), иначе история заполнится
 * сотнями снимков одного и того же текста.
 */

/** Создаёт ТЗ — пустое или из пресета. */
export async function createBrief(
  templateId?: string,
): Promise<{ briefId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { error: 'errors.forbidden' };

  let sections: BriefSections = emptyBriefSections();
  let title = '';

  if (templateId) {
    const template = await prisma.briefTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        sections: true,
        title: true,
        isSystem: true,
        isPublic: true,
        hiddenAt: true,
        ownerId: true,
      },
    });

    // Чужой личный шаблон использовать нельзя; чужой опубликованный — можно,
    // пока он не снят модерацией (§4.4, post-MVP №6).
    const allowed =
      template !== null &&
      (template.isSystem ||
        template.ownerId === user.id ||
        (template.isPublic && template.hiddenAt === null));

    if (template && allowed) {
      sections = parseBriefSections(template.sections);
      // Заголовок системного пресета — ключ i18n, подставлять его в ТЗ нельзя.
      title = template.isSystem ? '' : template.title;

      // Счётчик использований — по нему сортируется каталог. Свои
      // применения не считаются: иначе автор накручивает себе место.
      if (!template.isSystem && template.ownerId !== user.id) {
        await prisma.briefTemplate.update({
          where: { id: template.id },
          data: { usesCount: { increment: 1 } },
        });
      }
    }
  }

  const brief = await prisma.brief.create({
    data: {
      ownerId: user.id,
      ownerRole: user.lastRoleContext === 'designer' ? 'designer' : 'customer',
      title,
      sections: sections as unknown as Prisma.InputJsonValue,
      sourceLocale: user.locale,
    },
    select: { id: true },
  });

  return { briefId: brief.id };
}

/**
 * «Заказать похожее» с карточки работы (§4.5): создаёт ТЗ, где работа уже
 * приложена референсом, а тип и стиль подставлены из неё.
 */
export async function createBriefFromWork(
  workId: string,
): Promise<{ briefId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return { error: 'errors.forbidden' };

  const work = await prisma.portfolioWork.findUnique({
    where: { id: workId },
    select: {
      id: true,
      title: true,
      assetType: true,
      styles: true,
      software: true,
      engines: true,
      isHidden: true,
      visibility: true,
      media: {
        where: { type: 'image' },
        orderBy: { order: 'asc' },
        take: 1,
        select: { url: true },
      },
    },
  });

  if (!work || work.isHidden || work.visibility !== 'public') return { error: 'errors.notFound' };

  const sections = emptyBriefSections();
  sections.general.assetType = work.assetType;
  sections.style.styleTags = work.styles;
  // В ТЗ движок один, а в работе их может быть несколько — берём первый
  // как отправную точку, остальное заказчик уточнит в конструкторе.
  sections.tech.engine = work.engines[0] ?? '';

  const cover = work.media[0]?.url;
  if (cover) {
    sections.style.references = [{ kind: 'image', url: cover, note: work.title }];
  }

  const brief = await prisma.brief.create({
    data: {
      ownerId: user.id,
      ownerRole: 'customer',
      title: '',
      sections: sections as unknown as Prisma.InputJsonValue,
      sourceLocale: user.locale,
    },
    select: { id: true },
  });

  return { briefId: brief.id };
}

/**
 * Автосохранение. Возвращает время сохранения, чтобы конструктор показал
 * «сохранено в 14:32», а не молча притворялся, что всё в порядке.
 */
export async function autosaveBrief(input: {
  briefId: string;
  title: string;
  sections: unknown;
}): Promise<{ ok: boolean; savedAt?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const brief = await prisma.brief.findUnique({
    where: { id: input.briefId },
    select: { ownerId: true, status: true },
  });

  if (!brief || brief.ownerId !== user.id) return { ok: false };
  // Замороженное ТЗ правится только через BriefChangeRequest (фаза 4).
  if (brief.status === 'frozen') return { ok: false };

  const sections = parseBriefSections(input.sections);

  await prisma.brief.update({
    where: { id: input.briefId },
    data: {
      title: input.title.slice(0, 140),
      sections: sections as unknown as Prisma.InputJsonValue,
    },
  });

  return { ok: true, savedAt: new Date().toISOString() };
}

/** Явное сохранение: проверяет форму, поднимает версию и делает снимок. */
export async function saveBrief(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) return errorState('errors.forbidden');

  const briefId = formData.get('briefId');
  if (typeof briefId !== 'string') return errorState('errors.generic');

  const rawSections = formData.get('sections');
  let parsedSections: unknown;
  try {
    parsedSections = JSON.parse(typeof rawSections === 'string' ? rawSections : '{}');
  } catch {
    return errorState('errors.generic');
  }

  const parsed = briefSaveSchema.safeParse({
    title: formData.get('title') ?? '',
    sections: parseBriefSections(parsedSections),
    comment: formData.get('comment') ?? '',
  });

  if (!parsed.success) {
    return errorState('errors.generic', { fieldErrors: fieldErrorsFrom(parsed.error) });
  }

  const brief = await getOwnBrief(briefId, user.id);
  if (!brief) return errorState('errors.forbidden');
  if (brief.status === 'frozen') return errorState('errors.brief.frozen');

  const nextVersion = brief.currentVersion + 1;

  await prisma.$transaction([
    prisma.brief.update({
      where: { id: briefId },
      data: {
        title: parsed.data.title,
        sections: parsed.data.sections as unknown as Prisma.InputJsonValue,
        currentVersion: nextVersion,
        // Первое сохранение выводит ТЗ из черновика: им уже можно делиться.
        status: brief.status === 'draft' ? 'active' : brief.status,
        // Готовый PDF устарел вместе с содержимым.
        pdfStatus: null,
        pdfUrl: null,
      },
    }),
    prisma.briefVersion.create({
      data: {
        briefId,
        version: nextVersion,
        title: parsed.data.title,
        sections: parsed.data.sections as unknown as Prisma.InputJsonValue,
        authorId: user.id,
        comment: parsed.data.comment || null,
      },
    }),
  ]);

  revalidatePath(`/briefs/${briefId}`);

  return successState({ message: 'settings.saved', redirectTo: `/briefs/${briefId}` });
}

/** Смена уровня доступа. Для `link` создаёт токен, если его ещё нет. */
export async function setBriefAccess(
  briefId: string,
  access: string,
): Promise<{ ok: boolean; shareToken?: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  if (!['private', 'link', 'selected', 'public'].includes(access)) return { ok: false };

  const brief = await getOwnBrief(briefId, user.id);
  if (!brief) return { ok: false };

  const needsToken = access === 'link' && !brief.shareToken;

  const updated = await prisma.brief.update({
    where: { id: briefId },
    data: {
      access: access as 'private' | 'link' | 'selected' | 'public',
      ...(needsToken ? { shareToken: generateShareToken() } : {}),
      // Публиковать черновик нельзя: сначала он должен стать active.
      ...(brief.status === 'draft' && access !== 'private' ? { status: 'active' as const } : {}),
    },
    select: { shareToken: true },
  });

  // Открытие ТЗ наружу — событие, которое стоит видеть в аудите.
  if (access === 'public' || access === 'link') {
    await writeAuditLog({
      action: 'brief.shared',
      actorId: user.id,
      targetType: 'brief',
      targetId: briefId,
      payload: { access },
    });
  }

  revalidatePath(`/briefs/${briefId}`);

  return { ok: true, shareToken: updated.shareToken };
}

/** Перевыпуск ссылки: старая перестаёт работать. */
export async function rotateShareToken(briefId: string): Promise<{ ok: boolean; shareToken?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const brief = await getOwnBrief(briefId, user.id);
  if (!brief) return { ok: false };

  const token = generateShareToken();
  await prisma.brief.update({ where: { id: briefId }, data: { shareToken: token } });

  return { ok: true, shareToken: token };
}

export async function archiveBrief(briefId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const brief = await getOwnBrief(briefId, user.id);
  if (!brief) return { ok: false };
  // Замороженное ТЗ участвует в сделке — архивировать его нельзя.
  if (brief.status === 'frozen') return { ok: false };

  await prisma.brief.update({ where: { id: briefId }, data: { status: 'archived' } });
  revalidatePath('/briefs');

  return { ok: true };
}

export async function deleteBrief(briefId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const brief = await getOwnBrief(briefId, user.id);
  if (!brief || brief.status === 'frozen') return { ok: false };

  await prisma.brief.delete({ where: { id: briefId } });
  revalidatePath('/briefs');

  return { ok: true };
}

/** «Сохранить как мой шаблон» (§4.4). */
export async function saveBriefAsTemplate(
  briefId: string,
  templateTitle: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const parsedTitle = briefTitleSchema.safeParse(templateTitle);
  if (!parsedTitle.success) {
    return { ok: false, error: parsedTitle.error.issues[0]?.message ?? 'errors.generic' };
  }

  const brief = await getOwnBrief(briefId, user.id);
  if (!brief) return { ok: false, error: 'errors.forbidden' };

  await prisma.briefTemplate.create({
    data: {
      ownerId: user.id,
      isSystem: false,
      title: parsedTitle.data,
      sections: brief.sections as unknown as Prisma.InputJsonValue,
    },
  });

  return { ok: true };
}

/** Запрос PDF: генерацию делает воркер, страница ждёт готовности. */
export async function requestBriefPdf(briefId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'errors.forbidden' };

  const brief = await getOwnBrief(briefId, user.id);
  if (!brief) return { ok: false, error: 'errors.forbidden' };

  await prisma.brief.update({
    where: { id: briefId },
    data: { pdfStatus: 'pending', pdfVersion: brief.currentVersion },
  });

  await enqueueBriefPdf({ briefId, locale: brief.sourceLocale });

  return { ok: true };
}

/** Статус генерации PDF — конструктор опрашивает его после запроса. */
export async function getBriefPdfStatus(
  briefId: string,
): Promise<{ status: string | null; url: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { status: null, url: null };

  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    select: { ownerId: true, pdfStatus: true, pdfUrl: true },
  });

  if (!brief || brief.ownerId !== user.id) return { status: null, url: null };

  return { status: brief.pdfStatus, url: brief.pdfUrl };
}

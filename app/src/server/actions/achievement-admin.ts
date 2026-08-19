'use server';

import { revalidatePath } from 'next/cache';

import { prisma, type AchievementAudience } from '@polyforge/db';
import {
  ACHIEVEMENT_AUDIENCES,
  ACHIEVEMENT_ICONS,
  ACHIEVEMENT_KEY_PATTERN,
  ACHIEVEMENT_METRICS,
} from '@polyforge/shared';

import { achievementBuilderEnabled, invalidateAchievementCache } from '../achievements';
import { writeAuditLog } from '../audit';
import { adminOrNull } from '../auth/guards';

/**
 * Конструктор достижений (§3, post-MVP №9).
 *
 * Админ собирает достижение из готовых метрик — выбрать можно только из
 * списка, а не написать условие. Метрика — это запрос к базе; форма,
 * позволяющая ввести его текстом, была бы способом уронить платформу из
 * админки, а не удобством.
 */

type Result = { ok: true } | { ok: false; error: string };

interface AchievementInput {
  key: string;
  audience: string;
  metric: string;
  bronze: number;
  silver: number;
  gold: number;
  icon: string;
  isHidden: boolean;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
}

/**
 * Проверка формы. У системных достижений подписи живут в словарях, и форма
 * их не показывает — требовать их с пустой формы значило бы запретить
 * править пороги стандартного набора.
 */
function validate(input: AchievementInput, checkTexts = true): string | null {
  if (!ACHIEVEMENT_KEY_PATTERN.test(input.key)) return 'errors.achievement.badKey';
  if (!(ACHIEVEMENT_AUDIENCES as readonly string[]).includes(input.audience)) return 'errors.generic';
  if (!(ACHIEVEMENT_METRICS as readonly string[]).includes(input.metric)) {
    return 'errors.achievement.badMetric';
  }
  if (!(ACHIEVEMENT_ICONS as readonly string[]).includes(input.icon)) return 'errors.generic';

  const { bronze, silver, gold } = input;
  if (![bronze, silver, gold].every((value) => Number.isInteger(value) && value > 0)) {
    return 'errors.achievement.badThresholds';
  }

  // Пороги обязаны расти: иначе серебро выдаётся раньше бронзы, и тир
  // перестаёт что-либо значить.
  if (!(bronze < silver && silver < gold)) return 'errors.achievement.thresholdOrder';

  if (!checkTexts) return null;

  const titles = [input.titleRu, input.titleEn];
  if (titles.some((title) => title.trim().length < 2 || title.length > 80)) {
    return 'errors.achievement.badTitle';
  }

  const descriptions = [input.descriptionRu, input.descriptionEn];
  if (descriptions.some((text) => text.trim().length < 5 || text.length > 300)) {
    return 'errors.achievement.badDescription';
  }

  return null;
}

export async function createAchievement(input: AchievementInput): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  if (!(await achievementBuilderEnabled())) {
    return { ok: false, error: 'errors.achievement.disabled' };
  }

  const problem = validate(input);
  if (problem) return { ok: false, error: problem };

  const taken = await prisma.achievement.findUnique({
    where: { key: input.key },
    select: { id: true },
  });
  if (taken) return { ok: false, error: 'errors.achievement.keyTaken' };

  const created = await prisma.achievement.create({
    data: {
      key: input.key,
      audience: input.audience as AchievementAudience,
      metric: input.metric,
      bronze: input.bronze,
      silver: input.silver,
      gold: input.gold,
      icon: input.icon,
      isHidden: input.isHidden,
      isSystem: false,
      titleRu: input.titleRu.trim(),
      titleEn: input.titleEn.trim(),
      descriptionRu: input.descriptionRu.trim(),
      descriptionEn: input.descriptionEn.trim(),
      createdById: admin.id,
    },
    select: { id: true },
  });

  await writeAuditLog({
    action: 'achievement.created',
    actorId: admin.id,
    targetType: 'achievement',
    targetId: created.id,
    payload: { key: input.key, metric: input.metric },
  });

  await invalidateAchievementCache();
  revalidatePath('/admin/achievements');

  return { ok: true };
}

export async function updateAchievement(id: string, input: AchievementInput): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  if (!(await achievementBuilderEnabled())) {
    return { ok: false, error: 'errors.achievement.disabled' };
  }

  const existing = await prisma.achievement.findUnique({
    where: { id },
    select: { key: true, isSystem: true, metric: true },
  });
  if (!existing) return { ok: false, error: 'errors.notFound' };

  // У системного достижения ключ и метрика заданы кодом: ключ ходит в словарь
  // подписей, метрику считает воркер. Меняются только пороги, иконка и
  // видимость — за них отвечает админ.
  const key = existing.isSystem ? existing.key : input.key;
  const metric = existing.isSystem ? existing.metric : input.metric;

  const problem = validate({ ...input, key, metric }, !existing.isSystem);
  if (problem) return { ok: false, error: problem };

  if (key !== existing.key) {
    const taken = await prisma.achievement.findUnique({ where: { key }, select: { id: true } });
    if (taken) return { ok: false, error: 'errors.achievement.keyTaken' };
  }

  await prisma.achievement.update({
    where: { id },
    data: {
      key,
      audience: input.audience as AchievementAudience,
      metric,
      bronze: input.bronze,
      silver: input.silver,
      gold: input.gold,
      icon: input.icon,
      isHidden: input.isHidden,
      // Подписи системных остаются в словаре: перекрыть их полем значило бы
      // потерять перевод на второй язык при первой же правке.
      ...(existing.isSystem
        ? {}
        : {
            titleRu: input.titleRu.trim(),
            titleEn: input.titleEn.trim(),
            descriptionRu: input.descriptionRu.trim(),
            descriptionEn: input.descriptionEn.trim(),
          }),
    },
  });

  await writeAuditLog({
    action: 'achievement.updated',
    actorId: admin.id,
    targetType: 'achievement',
    targetId: id,
    payload: { key },
  });

  await invalidateAchievementCache();
  revalidatePath('/admin/achievements');

  return { ok: true };
}

/**
 * Включение и выключение.
 *
 * Выключенное достижение перестаёт выдаваться и исчезает из списков, но
 * уже выданные экземпляры остаются у людей: отобрать награду задним числом
 * — не то же самое, что перестать её давать.
 */
export async function setAchievementEnabled(id: string, enabled: boolean): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  const updated = await prisma.achievement.updateMany({
    where: { id },
    data: { isEnabled: enabled },
  });
  if (updated.count === 0) return { ok: false, error: 'errors.notFound' };

  await writeAuditLog({
    action: enabled ? 'achievement.enabled' : 'achievement.disabled',
    actorId: admin.id,
    targetType: 'achievement',
    targetId: id,
  });

  await invalidateAchievementCache();
  revalidatePath('/admin/achievements');

  return { ok: true };
}

/**
 * Удаление собственного достижения.
 *
 * Системные не удаляются: их вернёт ближайший сид, и кнопка окажется
 * обманом. Их выключают.
 */
export async function deleteAchievement(id: string): Promise<Result> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: 'errors.forbidden' };

  if (!(await achievementBuilderEnabled())) {
    return { ok: false, error: 'errors.achievement.disabled' };
  }

  const existing = await prisma.achievement.findUnique({
    where: { id },
    select: { key: true, isSystem: true },
  });
  if (!existing) return { ok: false, error: 'errors.notFound' };
  if (existing.isSystem) return { ok: false, error: 'errors.achievement.systemLocked' };

  const holders = await prisma.userAchievement.count({ where: { key: existing.key } });
  // Выданное достижение не удаляем: на полках людей остались бы записи без
  // подписи и иконки. Такое сначала выключают, и оно перестаёт выдаваться.
  if (holders > 0) return { ok: false, error: 'errors.achievement.hasHolders' };

  await prisma.achievement.delete({ where: { id } });

  await writeAuditLog({
    action: 'achievement.deleted',
    actorId: admin.id,
    targetType: 'achievement',
    targetId: id,
    payload: { key: existing.key },
  });

  await invalidateAchievementCache();
  revalidatePath('/admin/achievements');

  return { ok: true };
}

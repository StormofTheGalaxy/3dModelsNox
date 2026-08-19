import { hash } from '@node-rs/argon2';

import { prisma } from '@polyforge/db';
import { ACHIEVEMENTS, SETTINGS_REGISTRY, SETTING_KEYS } from '@polyforge/shared';

import { SYSTEM_BRIEF_TEMPLATES } from './brief-templates';
import { SYSTEM_TEST_TASKS } from './test-tasks';

/**
 * Идемпотентный seed: настройки платформы + суперадмин.
 * Запускается на каждом деплое, ничего не перезатирая.
 */

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function inviteCode(length = 10): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

async function seedSettings(): Promise<void> {
  // Значения по умолчанию берём из типизированного реестра — второй копии
  // дефолтов в проекте нет.
  for (const key of SETTING_KEYS) {
    await prisma.platformSetting.upsert({
      where: { key },
      // Значение, изменённое админом, seed не трогает.
      update: {},
      create: { key, value: SETTINGS_REGISTRY[key].default as object },
    });
  }

  console.info(`✓ настройки платформы: ${SETTING_KEYS.length} ключей`);
}

async function seedSuperAdmin(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const nickname = process.env.SEED_ADMIN_NICKNAME ?? 'admin';

  if (!password) {
    console.warn('! SEED_ADMIN_PASSWORD не задан — суперадмин не создан');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    console.info(`✓ суперадмин уже существует: ${email}`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      nickname,
      nicknameLower: nickname.toLowerCase(),
      passwordHash: await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
      role: 'admin',
      emailVerifiedAt: new Date(),
      invitesLeft: 0,
    },
    select: { id: true },
  });

  // Пачка инвайтов, чтобы было чем открывать бету.
  const count = Number(SETTINGS_REGISTRY.invites_default.default) * 5;
  await prisma.invite.createMany({
    data: Array.from({ length: count }, () => ({ code: inviteCode(), ownerId: user.id })),
    skipDuplicates: true,
  });
  await prisma.user.update({ where: { id: user.id }, data: { invitesLeft: count } });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'user.registered',
      targetType: 'user',
      targetId: user.id,
      payload: { seed: true, role: 'admin' },
    },
  });

  console.info(`✓ суперадмин создан: ${email} (${count} инвайтов)`);
}

/**
 * Системные пресеты ТЗ. Секции обновляются на каждом деплое: они часть кода,
 * а не пользовательские данные. Личные шаблоны seed не трогает.
 */
async function seedBriefTemplates(): Promise<void> {
  for (const template of SYSTEM_BRIEF_TEMPLATES) {
    const sections = template.build() as object;

    await prisma.briefTemplate.upsert({
      where: { key: template.key },
      update: { sections, order: template.order, isSystem: true },
      create: {
        key: template.key,
        isSystem: true,
        order: template.order,
        // Подписи берутся из словарей i18n по ключу пресета.
        title: `briefTemplates.${template.key}.title`,
        description: `briefTemplates.${template.key}.description`,
        sections,
      },
    });
  }

  console.info(`✓ пресеты ТЗ: ${SYSTEM_BRIEF_TEMPLATES.length}`);
}

/**
 * Пул тестовых заданий для верификации (§4.9).
 * Заданиями управляет админ, поэтому существующие записи не перетираются.
 */
async function seedTestTasks(): Promise<void> {
  for (const task of SYSTEM_TEST_TASKS) {
    const existing = await prisma.testTask.findFirst({
      where: { specialization: task.specialization as never, titleRu: task.titleRu },
      select: { id: true },
    });

    if (existing) continue;

    await prisma.testTask.create({
      data: {
        specialization: task.specialization as never,
        titleRu: task.titleRu,
        titleEn: task.titleEn,
        bodyRu: task.bodyRu,
        bodyEn: task.bodyEn,
        estimateHours: task.estimateHours,
      },
    });
  }

  console.info(`✓ тестовые задания: ${SYSTEM_TEST_TASKS.length}`);
}

/**
 * Стандартный набор достижений (§3, post-MVP №9).
 *
 * Каталог живёт в таблице, но стандартные достижения приходят из кода:
 * так свежая установка одинакова везде, а обновление платформы может
 * добавить новое системное достижение.
 *
 * Пороги и иконки существующих записей не перетираются: админ мог их
 * поправить осознанно, и деплой не должен отменять его решение.
 */
async function seedAchievements(): Promise<void> {
  for (const [index, definition] of ACHIEVEMENTS.entries()) {
    await prisma.achievement.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        audience: definition.audience,
        metric: definition.metric,
        bronze: definition.thresholds.bronze,
        silver: definition.thresholds.silver,
        gold: definition.thresholds.gold,
        icon: definition.icon,
        isHidden: definition.isHidden ?? false,
        isSystem: true,
        sortOrder: index,
      },
      // Метрика — код, и расходиться с ним запись не должна; остальное
      // остаётся таким, каким его оставил админ.
      update: { metric: definition.metric, isSystem: true },
    });
  }

  console.info(`✓ достижения: ${ACHIEVEMENTS.length}`);
}

async function main(): Promise<void> {
  await seedSettings();
  await seedBriefTemplates();
  await seedTestTasks();
  await seedAchievements();
  await seedSuperAdmin();
}

main()
  .catch((error: unknown) => {
    console.error('Ошибка seed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

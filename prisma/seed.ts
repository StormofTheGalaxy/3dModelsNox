import { hash } from '@node-rs/argon2';

import { prisma } from '@polyforge/db';
import { SETTINGS_REGISTRY, SETTING_KEYS } from '@polyforge/shared';

import { SYSTEM_BRIEF_TEMPLATES } from './brief-templates';

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

async function main(): Promise<void> {
  await seedSettings();
  await seedBriefTemplates();
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

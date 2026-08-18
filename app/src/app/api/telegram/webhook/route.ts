import { timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@polyforge/db';
import { escapeHtml, parseCommand } from '@polyforge/telegram';
import { getEmailTranslator } from '@polyforge/mail';
import type { Locale } from '@polyforge/shared';

import { writeAuditLog } from '@/server/audit';
import { hashToken } from '@/server/auth/tokens';
import { absoluteUrl } from '@/server/env';
import { env } from '@/server/env';
import { telegramEnabled, telegramProvider } from '@/server/telegram';

/**
 * Вебхук Telegram-бота (§3, post-MVP №2).
 *
 * Эндпоинт публичный по определению, поэтому единственная защита —
 * секрет, который Telegram присылает заголовком и который знаем только
 * мы и он. Без совпадения отвечаем 401 и ничего не делаем.
 *
 * Бот понимает три команды: /start <токен> — привязать аккаунт,
 * /stop — отвязать, /help — что это вообще такое. На всё остальное
 * отвечает подсказкой: переписываться с ботом смысла нет.
 */

export const runtime = 'nodejs';
// Вебхук обязан быть динамическим: у него нет кэшируемого представления.
export const dynamic = 'force-dynamic';

function secretMatches(received: string | null): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function reply(chatId: string, locale: Locale, key: string, values?: Record<string, string>) {
  const t = getEmailTranslator(locale);
  await telegramProvider().sendMessage(chatId, {
    text: escapeHtml(t(`telegram.${key}`, values)),
  });
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!(await telegramEnabled())) {
    // Флаг выключен — Telegram всё равно должен получить 200, иначе он
    // будет ретраить обновление часами.
    return NextResponse.json({ ok: true });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const command = parseCommand(update);
  if (!command) return NextResponse.json({ ok: true });

  // Язык ответа: пока чат не привязан, знать язык человека неоткуда —
  // после привязки отвечаем на языке его аккаунта.
  const linked = await prisma.user.findUnique({
    where: { telegramChatId: command.chatId },
    select: { id: true, locale: true },
  });

  const locale = (linked?.locale ?? 'ru') as Locale;

  if (command.command === 'help') {
    await reply(command.chatId, locale, 'help');
    return NextResponse.json({ ok: true });
  }

  if (command.command === 'stop') {
    if (!linked) {
      await reply(command.chatId, locale, 'notLinked');
      return NextResponse.json({ ok: true });
    }

    await prisma.user.update({
      where: { id: linked.id },
      data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null },
    });

    await writeAuditLog({
      action: 'telegram.unlinked',
      actorId: linked.id,
      targetType: 'user',
      targetId: linked.id,
      payload: { source: 'bot' },
    });

    await reply(command.chatId, locale, 'unlinked');
    return NextResponse.json({ ok: true });
  }

  if (command.command !== 'start') {
    await reply(command.chatId, locale, 'unknown');
    return NextResponse.json({ ok: true });
  }

  if (!command.argument) {
    await reply(command.chatId, locale, 'needToken', { url: absoluteUrl('/ru/settings') });
    return NextResponse.json({ ok: true });
  }

  const token = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(command.argument) },
    select: { id: true, type: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!token || token.type !== 'telegram_link' || token.usedAt || token.expiresAt < new Date()) {
    await reply(command.chatId, locale, 'badToken');
    return NextResponse.json({ ok: true });
  }

  // Чат мог быть привязан к другому аккаунту — освобождаем: уникальность
  // chatId иначе уронит транзакцию, а человек не поймёт почему.
  await prisma.user.updateMany({
    where: { telegramChatId: command.chatId, id: { not: token.userId } },
    data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null },
  });

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: token.userId },
      data: {
        telegramChatId: command.chatId,
        telegramUsername: command.username,
        telegramLinkedAt: new Date(),
        telegramNotifications: true,
      },
      select: { locale: true, nickname: true },
    }),
    prisma.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
  ]);

  await writeAuditLog({
    action: 'telegram.linked',
    actorId: token.userId,
    targetType: 'user',
    targetId: token.userId,
  });

  await reply(command.chatId, user.locale as Locale, 'linked', { nickname: user.nickname });

  return NextResponse.json({ ok: true });
}

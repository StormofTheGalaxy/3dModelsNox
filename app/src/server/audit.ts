import 'server-only';

import { headers } from 'next/headers';

import { prisma, type Prisma } from '@polyforge/db';
import type { AuditAction, AuditTargetType } from '@polyforge/shared';

/**
 * Аудит-лог (§2.4). Таблица append-only: записи не редактируются и не удаляются.
 * Запись никогда не должна ронять основную операцию — ошибки только логируются.
 */

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  targetType?: AuditTargetType;
  targetId?: string | null;
  payload?: Prisma.InputJsonValue;
}

/** IP и User-Agent берём из заголовков запроса, учитывая reverse proxy. */
export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0]?.trim() || headerList.get('x-real-ip') || null;
    return { ip, userAgent: headerList.get('user-agent') };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const { ip, userAgent } = await requestContext();

  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        payload: entry.payload ?? undefined,
        ip,
        userAgent: userAgent?.slice(0, 512) ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] не удалось записать событие', entry.action, error);
  }
}

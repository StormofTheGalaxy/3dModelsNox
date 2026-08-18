import { NextResponse } from 'next/server';

import { prisma } from '@polyforge/db';

import { getCurrentUser, isStaff } from '@/server/auth/session';
import { sourcesUnlocked } from '@/server/deals';
import { storage } from '@/server/storage';

/**
 * Выдача файлов сделки (§4.6).
 *
 * Приватный бакет + проверка прав на каждый запрос, а не подписанная ссылка
 * из разметки: ссылку можно переслать, а исходники до оплаты финального
 * этапа заказчик получать не должен.
 *
 * `?kind=delivery|receipt|attachment` — файлы лежат в трёх таблицах, но
 * правило доступа у них общее, поэтому и маршрут один.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { fileId } = await params;
  const kind = new URL(request.url).searchParams.get('kind') ?? 'delivery';

  const found = await locate(kind, fileId);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const staff = isStaff(user);
  const isParticipant = found.customerId === user.id || found.designerId === user.id;
  if (!isParticipant && !staff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Исходники — только дизайнеру, персоналу и заказчику после оплаты финала.
  if (found.gated && user.id === found.customerId && !staff && !found.unlocked) {
    return NextResponse.json({ error: 'locked' }, { status: 402 });
  }

  try {
    const body = await storage().get('private', found.storageKey);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': found.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
        // Приватные файлы не кэшируются посредниками: права проверяются каждый раз.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}

interface LocatedFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  customerId: string;
  designerId: string;
  /** Требуется ли подтверждённая оплата финала. */
  gated: boolean;
  unlocked: boolean;
}

async function locate(kind: string, fileId: string): Promise<LocatedFile | null> {
  if (kind === 'receipt') {
    const file = await prisma.paymentFile.findUnique({
      where: { id: fileId },
      select: {
        storageKey: true,
        fileName: true,
        mimeType: true,
        payment: {
          select: { milestone: { select: { deal: { select: { customerId: true, designerId: true } } } } },
        },
      },
    });

    if (!file) return null;
    const deal = file.payment.milestone.deal;

    return {
      storageKey: file.storageKey,
      fileName: file.fileName,
      mimeType: file.mimeType,
      customerId: deal.customerId,
      designerId: deal.designerId,
      gated: false,
      unlocked: true,
    };
  }

  if (kind === 'attachment') {
    const file = await prisma.messageAttachment.findUnique({
      where: { id: fileId },
      select: {
        storageKey: true,
        fileName: true,
        mimeType: true,
        message: { select: { deal: { select: { customerId: true, designerId: true } } } },
      },
    });

    if (!file?.message.deal) return null;

    return {
      storageKey: file.storageKey,
      fileName: file.fileName,
      mimeType: file.mimeType,
      customerId: file.message.deal.customerId,
      designerId: file.message.deal.designerId,
      gated: false,
      unlocked: true,
    };
  }

  const file = await prisma.deliveryFile.findUnique({
    where: { id: fileId },
    select: {
      storageKey: true,
      fileName: true,
      mimeType: true,
      isSource: true,
      delivery: {
        select: {
          milestone: {
            select: {
              deal: {
                select: {
                  customerId: true,
                  designerId: true,
                  milestones: { select: { position: true, status: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!file) return null;
  const deal = file.delivery.milestone.deal;

  return {
    storageKey: file.storageKey,
    fileName: file.fileName,
    mimeType: file.mimeType,
    customerId: deal.customerId,
    designerId: deal.designerId,
    gated: file.isSource,
    unlocked: sourcesUnlocked(deal.milestones),
  };
}

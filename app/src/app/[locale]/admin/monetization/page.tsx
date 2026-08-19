import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@polyforge/db';

import { MonetizationPanel } from '@/components/admin/monetization-panel';
import { getCurrentUser } from '@/server/auth/session';
import { listPlans, promotionsEnabled, subscriptionsEnabled } from '@/server/monetization';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Монетизация (§1.2.2, post-MVP №12).
 *
 * Раздел показывает тарифы и продвижение и позволяет выдать их вручную.
 * Продажи здесь нет и быть не может: она требует платёжного модуля, а он —
 * юрлица (ADR 0019).
 */
export default async function AdminMonetizationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (user?.role !== 'admin') notFound();

  const now = new Date();

  const [plans, subscriptionsOn, promotionsOn, subscriptions, promotions, t] = await Promise.all([
    listPlans(),
    subscriptionsEnabled(),
    promotionsEnabled(),
    prisma.userSubscription.findMany({
      where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: { startsAt: 'desc' },
      take: 40,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        note: true,
        plan: { select: { key: true } },
        user: { select: { nickname: true } },
      },
    }),
    prisma.promotion.findMany({
      where: { endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
      take: 40,
      select: {
        id: true,
        kind: true,
        target: true,
        targetId: true,
        endsAt: true,
        note: true,
      },
    }),
    getTranslations('admin.monetization'),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('description')}</p>
      </div>

      <MonetizationPanel
        locale={locale}
        subscriptionsOn={subscriptionsOn}
        promotionsOn={promotionsOn}
        plans={plans.map((plan) => ({
          id: plan.id,
          key: plan.key,
          audience: plan.audience,
          priceMinor: plan.priceMinor,
          currency: plan.currency,
          perks: (plan.perks ?? {}) as Record<string, number | boolean>,
        }))}
        subscriptions={subscriptions.map((subscription) => ({
          id: subscription.id,
          nickname: subscription.user.nickname,
          planKey: subscription.plan.key,
          startsAt: subscription.startsAt.toISOString(),
          endsAt: subscription.endsAt ? subscription.endsAt.toISOString() : null,
          note: subscription.note,
        }))}
        promotions={promotions.map((promotion) => ({
          id: promotion.id,
          kind: promotion.kind,
          target: promotion.target,
          targetId: promotion.targetId,
          endsAt: promotion.endsAt.toISOString(),
          note: promotion.note,
        }))}
      />
    </div>
  );
}

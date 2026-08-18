'use client';

import { Check, Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { reviewPayment } from '@/server/actions/admin';

/** Отметка чека модератором (§4.10). */
export function PaymentReviewActions({
  paymentId,
  check,
}: {
  paymentId: string;
  check: string;
}) {
  const t = useTranslations('admin.payments');
  const tRoot = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function review(verdict: 'verified' | 'flagged') {
    startTransition(async () => {
      const result = await reviewPayment(paymentId, verdict);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {check !== 'verified' ? (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => review('verified')}>
          <Check aria-hidden className="size-4" />
          {t('markVerified')}
        </Button>
      ) : null}

      {check !== 'flagged' ? (
        <Button size="sm" variant="ghost" loading={pending} onClick={() => review('flagged')}>
          <Flag aria-hidden className="size-4" />
          {t('markFlagged')}
        </Button>
      ) : null}
    </div>
  );
}

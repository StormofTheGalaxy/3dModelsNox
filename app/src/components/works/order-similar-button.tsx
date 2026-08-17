'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { createBriefFromWork } from '@/server/actions/briefs';

/**
 * «Заказать похожее» с карточки работы (§4.5): создаёт ТЗ, где работа уже
 * приложена референсом, и открывает конструктор.
 */
export function OrderSimilarButton({
  workId,
  canOrder,
}: {
  workId: string;
  canOrder: boolean;
}) {
  const t = useTranslations('works.detail');
  const tRoot = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function order() {
    if (!canOrder) {
      router.push('/login');
      return;
    }

    startTransition(async () => {
      const result = await createBriefFromWork(workId);

      if ('error' in result) {
        toast.error(tRoot(result.error));
        return;
      }

      router.push(`/briefs/${result.briefId}/edit`);
    });
  }

  return (
    <Button className="w-full" loading={pending} onClick={order}>
      {t('orderSimilar')}
    </Button>
  );
}

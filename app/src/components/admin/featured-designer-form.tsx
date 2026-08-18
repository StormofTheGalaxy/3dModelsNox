'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { setFeaturedDesigner } from '@/server/actions/admin';

/** «Дизайнер недели» на главной и в рейтинге (§4.8). */
export function FeaturedDesignerForm({ current }: { current: string }) {
  const t = useTranslations('admin.content');
  const tRoot = useTranslations();
  const router = useRouter();

  const [nickname, setNickname] = useState(current);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setFeaturedDesigner(nickname);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      toast.success(tRoot('settings.saved'));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <Input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder={t('featuredPlaceholder')}
          aria-label={t('featured')}
        />
      </div>
      <Button size="sm" loading={pending} onClick={save}>
        {t('featuredSave')}
      </Button>
      {current ? (
        <Button size="sm" variant="ghost" loading={pending} onClick={() => { setNickname(''); }}>
          {t('featuredClear')}
        </Button>
      ) : null}
    </div>
  );
}

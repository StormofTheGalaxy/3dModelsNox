'use client';

import { Copy, Link2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { rotateShareToken, setBriefAccess } from '@/server/actions/briefs';

const ACCESS_LEVELS = ['private', 'link', 'selected', 'public'] as const;

/**
 * Управление доступом к ТЗ (§4.4): приватно, по секретной ссылке, выбранным
 * пользователям или публично.
 */
export function BriefAccessControl({
  briefId,
  initialAccess,
  initialToken,
  baseUrl,
  locale,
}: {
  briefId: string;
  initialAccess: string;
  initialToken: string | null;
  baseUrl: string;
  locale: string;
}) {
  const t = useTranslations('brief.access');

  const [access, setAccess] = useState(initialAccess);
  const [token, setToken] = useState(initialToken);
  const [, startTransition] = useTransition();

  const shareUrl = token ? `${baseUrl}/${locale}/b/${token}` : null;

  function change(next: string) {
    const previous = access;
    setAccess(next);

    startTransition(async () => {
      const result = await setBriefAccess(briefId, next);
      if (!result.ok) {
        setAccess(previous);
        return;
      }
      setToken(result.shareToken ?? null);
    });
  }

  function rotate() {
    startTransition(async () => {
      const result = await rotateShareToken(briefId);
      if (result.ok && result.shareToken) {
        setToken(result.shareToken);
        toast.success(t('rotated'));
      }
    });
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('linkCopied'));
    } catch {
      // Без https буфер обмена недоступен — показываем ссылку тостом.
      toast.message(shareUrl);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-access">{t('label')}</Label>
          <Select
            id="brief-access"
            value={access}
            onChange={(event) => change(event.target.value)}
          >
            {ACCESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t(level)}
              </option>
            ))}
          </Select>
        </div>

        {access === 'link' || access === 'public' ? (
          <p className="text-xs text-fg-muted">{t('hint')}</p>
        ) : null}

        {access === 'link' && shareUrl ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 font-mono text-xs break-all text-fg-muted">
              <Link2 className="size-3.5 shrink-0" aria-hidden />
              {shareUrl}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={copy}>
                <Copy aria-hidden />
                {t('copyLink')}
              </Button>
              <Button size="sm" variant="ghost" onClick={rotate}>
                <RefreshCw aria-hidden />
                {t('rotate')}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

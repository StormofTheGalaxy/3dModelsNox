'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

/** Строка списка инвайтов: код, статус и копирование ссылки-приглашения. */
export function InviteRow({
  code,
  usedByNickname,
  inviteUrl,
}: {
  code: string;
  usedByNickname: string | null;
  inviteUrl: string;
}) {
  const t = useTranslations('invites');
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success(t('linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена недоступен (нет https или отказ в правах) — показываем ссылку.
      toast.message(inviteUrl);
    }
  }

  const used = Boolean(usedByNickname);

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <code className="font-mono text-sm tracking-[0.2em] text-fg">{code}</code>

      {used ? (
        <Badge variant="neutral">
          {t('statusUsed')} · {usedByNickname}
        </Badge>
      ) : (
        <Badge variant="success">{t('statusFree')}</Badge>
      )}

      {!used ? (
        <Button variant="ghost" size="sm" className="ml-auto" onClick={copyLink}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {t('copyLink')}
        </Button>
      ) : null}
    </div>
  );
}

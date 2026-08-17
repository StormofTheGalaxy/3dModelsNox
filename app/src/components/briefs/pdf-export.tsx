'use client';

import { Download, FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { getBriefPdfStatus, requestBriefPdf } from '@/server/actions/briefs';

/**
 * Экспорт ТЗ в PDF (§4.4). Файл собирает воркер, поэтому кнопка после запроса
 * опрашивает статус: держать пользователя в неведении хуже, чем опрос раз
 * в две секунды на несколько секунд.
 */
export function BriefPdfExport({
  briefId,
  initialStatus,
  initialUrl,
}: {
  briefId: string;
  initialStatus: string | null;
  initialUrl: string | null;
}) {
  const t = useTranslations('brief.pdf');

  const [status, setStatus] = useState(initialStatus);
  const [url, setUrl] = useState(initialUrl);
  const [, startTransition] = useTransition();
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (status !== 'pending') return;

    attemptsRef.current = 0;

    const timer = setInterval(() => {
      attemptsRef.current += 1;

      // Через минуту перестаём опрашивать: воркер либо упал, либо очередь стоит.
      if (attemptsRef.current > 30) {
        clearInterval(timer);
        setStatus('failed');
        return;
      }

      void getBriefPdfStatus(briefId).then((result) => {
        if (result.status && result.status !== 'pending') {
          setStatus(result.status);
          setUrl(result.url);
          clearInterval(timer);
        }
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [status, briefId]);

  function request() {
    startTransition(async () => {
      const result = await requestBriefPdf(briefId);
      if (!result.ok) {
        toast.error(t('failed'));
        return;
      }
      setStatus('pending');
      setUrl(null);
    });
  }

  if (status === 'pending') {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="animate-spin" aria-hidden />
        {t('pending')}
      </Button>
    );
  }

  if (status === 'ready' && url) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Download aria-hidden />
            {t('ready')}
          </a>
        </Button>
        <Button variant="ghost" size="sm" onClick={request}>
          {t('export')}
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={request}>
      <FileText aria-hidden />
      {status === 'failed' ? t('failed') : t('export')}
    </Button>
  );
}

'use client';

import { Languages, Paperclip, Pin, Reply, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';

import type { Locale } from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useDealSocket } from '@/hooks/use-deal-socket';
import { useRouter } from '@/i18n/navigation';
import { systemMessageValues } from '@/components/deals/system-message';
import type { DealMessageView } from '@/components/deals/types';
import {
  markDealRead,
  sendDealMessage,
  toggleMessagePin,
  translateDealMessage,
} from '@/server/actions/deal-chat';
import { idleState, type ActionState } from '@/server/actions/types';
import { cn, formatDate } from '@/lib/utils';

/**
 * Чат сделки (§4.7).
 *
 * Лента одна: реплики сторон и системные события в общей хронологии — только
 * так по переписке восстанавливается ход дела, когда доходит до спора.
 *
 * Реалтайм — украшение поверх БД: если ws недоступен, сообщение всё равно
 * сохранено и появится после обновления страницы.
 */
export function DealChat({
  dealId,
  viewerId,
  locale,
  initialMessages,
  readOnly,
}: {
  dealId: string;
  viewerId: string;
  locale: string;
  initialMessages: DealMessageView[];
  readOnly: boolean;
}) {
  const t = useTranslations('deals.chat');
  const tSystem = useTranslations('deals.system');
  const tVerdicts = useTranslations('disputes.verdicts');
  const tRoot = useTranslations();
  const router = useRouter();

  const [quoted, setQuoted] = useState<DealMessageView | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Локальной копии ленты нет намеренно: единственный источник правды —
  // серверный рендер, а ws только просит его обновить.
  const messages = initialMessages;

  const { connected, emitTyping } = useDealSocket(dealId, {
    onMessage: () => router.refresh(),
    onTyping: () => {
      setTyping(true);
      window.setTimeout(() => setTyping(false), 3000);
    },
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (readOnly) return;
    void markDealRead(dealId);
  }, [dealId, readOnly, messages.length]);

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await sendDealMessage(previous, formData);

      if (result.status === 'success') {
        formRef.current?.reset();
        setQuoted(null);
        router.refresh();
      } else if (result.message) {
        toast.error(tRoot(result.message, result.values));
      }

      return result;
    },
    idleState,
  );

  async function translate(message: DealMessageView) {
    const result = await translateDealMessage(message.id, locale as Locale);
    if (!result.ok || !result.text) {
      toast.error(tRoot(result.error ?? 'errors.generic'));
      return;
    }
    setTranslations((current) => ({ ...current, [message.id]: result.text as string }));
  }

  async function pin(message: DealMessageView) {
    const result = await toggleMessagePin(message.id);
    if (!result.ok) {
      toast.error(tRoot('errors.generic'));
      return;
    }
    router.refresh();
  }

  const pinned = messages.filter((message) => message.pinned);

  return (
    <div className="flex flex-col gap-3">
      {pinned.length > 0 ? (
        <div className="rounded-[var(--radius-control)] bg-surface-2 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <Pin aria-hidden className="size-3.5" />
            {t('pinned')}
          </p>
          <ul className="flex flex-col gap-1">
            {pinned.map((message) => (
              <li key={message.id} className="text-sm">
                {message.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div ref={listRef} className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
        {messages.map((message) => {
          if (message.kind === 'system') {
            return (
              <p key={message.id} className="text-center text-xs text-fg-muted">
                {message.systemKey
                  ? tSystem(
                      message.systemKey,
                      systemMessageValues(message.systemPayload, (verdict) => tVerdicts(verdict)),
                    )
                  : message.text}
              </p>
            );
          }

          const own = message.authorId === viewerId;
          const quotedMessage = message.quotedMessageId
            ? messages.find((entry) => entry.id === message.quotedMessageId)
            : null;

          return (
            <div
              key={message.id}
              className={cn('flex max-w-[85%] flex-col gap-1', own ? 'self-end items-end' : 'self-start')}
            >
              <span className="text-xs text-fg-muted">
                {message.author?.nickname} · {formatDate(message.createdAt, locale)}
              </span>

              <div
                className={cn(
                  'rounded-[var(--radius-card)] px-3.5 py-2.5 text-sm',
                  own ? 'bg-accent-soft' : 'bg-surface-2',
                )}
              >
                {quotedMessage ? (
                  <p className="mb-1.5 border-l-2 border-accent/50 pl-2 text-xs text-fg-muted">
                    {quotedMessage.text.slice(0, 120)}
                  </p>
                ) : null}

                {message.text ? <p className="whitespace-pre-line">{message.text}</p> : null}

                {translations[message.id] ? (
                  <p className="mt-1.5 border-t border-[var(--pf-border)] pt-1.5 text-fg-muted">
                    {translations[message.id]}
                  </p>
                ) : null}

                {message.attachments.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {message.attachments.map((file) => (
                      <li key={file.id}>
                        <a
                          href={`/api/deal-files/${file.id}?kind=attachment`}
                          className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                        >
                          <Paperclip aria-hidden className="size-3.5" />
                          {file.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {readOnly ? null : (
                <div className="flex gap-2 text-fg-muted">
                  <button
                    type="button"
                    className="text-xs hover:text-fg"
                    onClick={() => setQuoted(message)}
                  >
                    <Reply aria-hidden className="inline size-3.5" /> {t('quote')}
                  </button>
                  <button type="button" className="text-xs hover:text-fg" onClick={() => void pin(message)}>
                    <Pin aria-hidden className="inline size-3.5" />{' '}
                    {message.pinned ? t('unpin') : t('pin')}
                  </button>
                  {message.text ? (
                    <button
                      type="button"
                      className="text-xs hover:text-fg"
                      onClick={() => void translate(message)}
                    >
                      <Languages aria-hidden className="inline size-3.5" /> {t('translate')}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {typing ? <p className="text-xs text-fg-muted">{t('typing')}</p> : null}

      {readOnly ? null : (
        <form ref={formRef} action={action} className="flex flex-col gap-2">
          <input type="hidden" name="dealId" value={dealId} />
          <input type="hidden" name="quotedMessageId" value={quoted?.id ?? ''} />

          {quoted ? (
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-xs">
              <span className="truncate text-fg-muted">{quoted.text.slice(0, 80)}</span>
              <button type="button" className="text-fg-muted hover:text-fg" onClick={() => setQuoted(null)}>
                {t('cancelQuote')}
              </button>
            </div>
          ) : null}

          <Textarea
            name="text"
            rows={2}
            maxLength={4000}
            placeholder={t('placeholder')}
            onChange={emitTyping}
            aria-label={t('placeholder')}
          />

          <div className="flex items-center gap-2">
            <input
              type="file"
              name="files"
              multiple
              aria-label={t('attach')}
              className="min-w-0 flex-1 text-xs text-fg-muted"
            />
            <Button type="submit" size="sm" loading={pending}>
              <Send aria-hidden className="size-4" />
              {t('send')}
            </Button>
          </div>

          {state.status === 'error' && state.message ? (
            <p className="text-xs text-[var(--pf-danger)]">{tRoot(state.message, state.values)}</p>
          ) : null}

          {!connected ? <p className="text-xs text-fg-muted">{t('offline')}</p> : null}
        </form>
      )}
    </div>
  );
}

'use client';

import { MessagesSquare, Send, Sparkles, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import {
  askBriefClarification,
  loadBriefChat,
  markClarificationApplied,
} from '@/server/actions/ai';
import { cn } from '@/lib/utils';

/**
 * Чат уточнений по ТЗ (§4.4, post-MVP №3).
 *
 * Модель задаёт по одному вопросу и предлагает конкретные значения полей —
 * кнопка подставляет их в конструктор тем же путём, что и замечания из
 * «✨ Проверить ТЗ». Свободный текст никуда не подставляется сам.
 */

interface Suggestion {
  section: string;
  field: string;
  value: string;
  label: string;
}

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestions: Suggestion[];
  appliedFields: string[];
}

type Draft = { title: string; sections: unknown };

export function BriefClarifyChat({
  briefId,
  getDraft,
  onApplySuggestion,
}: {
  briefId: string;
  getDraft: () => Draft;
  onApplySuggestion: (section: string, field: string, value: string) => void;
}) {
  const t = useTranslations('brief.chat');
  const tTax = useTranslations('taxonomy');
  const tPlatform = useTranslations('brief.platform');
  const tFields = useTranslations('brief.fields');
  const tRoot = useTranslations();

  /**
   * Подпись кнопки. Модель — и настоящая, и заглушка — норовит вернуть сырое
   * значение перечисления («character»), поэтому известные значения
   * переводим сами, а свободный текст берём как есть.
   */
  function labelFor(suggestion: Suggestion): string {
    const field = tFields.has(suggestion.field) ? tFields(suggestion.field) : suggestion.field;

    if (suggestion.field === 'assetType' && tTax.has(`assetType.${suggestion.value}`)) {
      return `${field}: ${tTax(`assetType.${suggestion.value}`)}`;
    }
    if (suggestion.field === 'styleTags' && tTax.has(`style.${suggestion.value}`)) {
      return `${field}: ${tTax(`style.${suggestion.value}`)}`;
    }
    if (suggestion.field === 'platform' && tPlatform.has(suggestion.value)) {
      return `${field}: ${tPlatform(suggestion.value)}`;
    }

    return suggestion.label;
  }

  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState('');
  const [credits, setCredits] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  const endRef = useRef<HTMLDivElement>(null);

  // История подтягивается один раз при монтировании: диалог переживает
  // перезагрузку страницы, иначе уточнения теряются вместе с вкладкой.
  useEffect(() => {
    let cancelled = false;

    void loadBriefChat(briefId).then((result) => {
      if (cancelled) return;
      if (result.ok) setTurns(result.turns);
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [briefId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns.length]);

  function send() {
    const text = answer;

    startTransition(async () => {
      const result = await askBriefClarification(briefId, text, getDraft());

      if (!result.ok) {
        toast.error(tRoot(result.error, result.values));
        return;
      }

      setAnswer('');
      setTurns((current) => [...current, ...result.turns]);
      setCredits(result.meta.left);
      setDone(result.done);
    });
  }

  function apply(turn: Turn, suggestion: Suggestion) {
    onApplySuggestion(suggestion.section, suggestion.field, suggestion.value);

    const key = `${suggestion.section}.${suggestion.field}`;
    setTurns((current) =>
      current.map((item) =>
        item.id === turn.id ? { ...item, appliedFields: [...item.appliedFields, key] } : item,
      ),
    );

    void markClarificationApplied(turn.id, suggestion.section, suggestion.field);
  }

  const started = turns.length > 0;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <MessagesSquare aria-hidden className="size-5 text-accent" />
          {t('title')}
        </CardTitle>

        {credits !== null ? <Badge variant="neutral">{t('creditsLeft', { credits })}</Badge> : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('hint')}</p>

        {loaded && started ? (
          <ol className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {turns.map((turn) => (
              <li
                key={turn.id}
                className={cn(
                  'flex flex-col gap-2 rounded-[var(--radius-card)] px-4 py-3 text-sm',
                  // Сторону разговора видно по заливке и отступу: одинаковые
                  // тёмные плашки на телефоне сливаются в сплошной текст.
                  turn.role === 'assistant'
                    ? 'mr-6 bg-surface-2'
                    : 'ml-6 border border-accent/40 bg-accent-soft/40',
                )}
              >
                <p className="whitespace-pre-line">{turn.text}</p>

                {turn.suggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {turn.suggestions.map((suggestion) => {
                      const applied = turn.appliedFields.includes(
                        `${suggestion.section}.${suggestion.field}`,
                      );

                      return (
                        <Button
                          key={`${suggestion.section}.${suggestion.field}`}
                          size="sm"
                          variant={applied ? 'ghost' : 'secondary'}
                          disabled={applied}
                          onClick={() => apply(turn, suggestion)}
                        >
                          <Wand2 aria-hidden />
                          {applied
                            ? t('applied', { label: labelFor(suggestion) })
                            : labelFor(suggestion)}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            ))}
            <div ref={endRef} />
          </ol>
        ) : null}

        {done ? <Alert tone="success">{t('done')}</Alert> : null}

        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            value={answer}
            maxLength={2000}
            placeholder={started ? t('answerPlaceholder') : t('startPlaceholder')}
            onChange={(event) => setAnswer(event.target.value)}
            aria-label={t('answerLabel')}
          />

          <Button className="sm:w-fit" loading={pending} onClick={send}>
            {started ? <Send aria-hidden /> : <Sparkles aria-hidden />}
            {started ? t('send') : t('start')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import {
  ArrowRight,
  Calculator,
  Coins,
  FilePlus2,
  Inbox,
  MessagesSquare,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  UserPen,
  Users,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { askAssistant, type AssistantAnswer } from '@/server/actions/assistant';
import { cn } from '@/lib/utils';

/**
 * Единый ИИ-ассистент (post-MVP №10).
 *
 * Панель не выполняет действия за человека: она приводит к нужной кнопке.
 * Так у него не появляется вопроса «почему списались кредиты, я ничего не
 * нажимал», а у нас — необходимости объяснять модели все побочные эффекты
 * платформы.
 *
 * Рисуется порталом в body, и это не украшение. Кнопка ассистента живёт в
 * шапке, а у шапки `backdrop-filter` — такой предок становится содержащим
 * блоком для `position: fixed` внутри себя. Панель, отрисованная на месте,
 * позиционируется относительно шестидесятипиксельной шапки и уезжает за
 * верхний край экрана.
 */

const ICONS: Record<string, LucideIcon> = {
  FilePlus2,
  Sparkles,
  ShieldCheck,
  Calculator,
  MessagesSquare,
  Send,
  Users,
  Inbox,
  ScrollText,
  Wand2,
  UserPen,
  Coins,
};

const TOPICS = [
  'payments',
  'deal_flow',
  'disputes',
  'levels',
  'credits',
  'invites',
  'verification',
  'translation',
] as const;

export interface PanelAction {
  key: string;
  href: string;
  icon: string;
}

export function AssistantPanel({
  open,
  onClose,
  scope,
  entityId,
  actions,
  credits,
  isLive,
}: {
  open: boolean;
  onClose: () => void;
  scope: string;
  entityId: string | null;
  actions: PanelAction[];
  credits: number;
  isLive: boolean;
}) {
  const t = useTranslations('assistant');
  const tRoot = useTranslations();

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [pending, startTransition] = useTransition();

  // Escape закрывает панель: она перекрывает страницу, и выход должен быть
  // там, где его ищут.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Проверки «смонтировались ли» не нужно: открыть панель можно только
  // кликом, а клик бывает только в браузере — на сервере open всегда false,
  // и до document дело не доходит.
  if (!open) return null;

  function ask() {
    startTransition(async () => {
      const result = await askAssistant(question, scope, entityId);

      if (!result.ok) {
        toast.error(tRoot(result.error, result.values as never));
        return;
      }

      setAnswer(result.answer);
    });
  }

  const answerAction = answer?.kind === 'action' ? answer.action : undefined;
  const AnswerIcon = answerAction ? (ICONS[answerAction.icon] ?? Sparkles) : Sparkles;

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t('close')}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      />

      <aside
        role="dialog"
        aria-label={t('title')}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col gap-4 overflow-y-auto',
          'rounded-t-[var(--radius-card)] border-t border-[var(--pf-border)] bg-surface p-5',
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-t-0 sm:border-l',
          '[animation:pf-fade-in_140ms_var(--ease-out-quick)]',
        )}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles aria-hidden className="size-4 text-accent" />
              {t('title')}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{t('subtitle')}</p>
          </div>

          <Button size="sm" variant="ghost" onClick={onClose} aria-label={t('close')}>
            <X aria-hidden />
          </Button>
        </header>

        {!isLive ? <Alert tone="warning">{t('stub')}</Alert> : null}

        <div className="flex gap-2">
          <Input
            className="min-w-0 flex-1"
            value={question}
            placeholder={t('placeholder')}
            maxLength={500}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && question.trim().length >= 3) ask();
            }}
          />
          <Button
            className="shrink-0"
            loading={pending}
            disabled={question.trim().length < 3}
            onClick={ask}
          >
            {t('ask')}
          </Button>
        </div>

        <p className="text-xs text-fg-muted">{t('creditsLeft', { left: credits })}</p>

        {answer ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-2 p-4">
            {answer.kind === 'action' && answerAction ? (
              <>
                <p className="text-sm text-fg-muted">{answer.reason}</p>
                <Button asChild className="w-fit">
                  <Link href={answerAction.href} onClick={onClose}>
                    <AnswerIcon aria-hidden />
                    {t(`actions.${answerAction.key}.label`)}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </>
            ) : null}

            {answer.kind === 'topic' && answer.topic ? (
              <>
                <p className="font-medium">{t(`topics.${answer.topic}.title`)}</p>
                <p className="text-sm leading-relaxed text-fg-muted">
                  {t(`topics.${answer.topic}.body`)}
                </p>
              </>
            ) : null}

            {answer.kind === 'unknown' ? (
              <p className="text-sm text-fg-muted">{answer.reason || t('unknown')}</p>
            ) : null}
          </div>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {t('hereYouCan')}
          </h3>

          <ul className="flex flex-col gap-1.5">
            {actions.map((action) => {
              const Icon = ICONS[action.icon] ?? Sparkles;

              return (
                <li key={action.key}>
                  <Link
                    href={action.href}
                    onClick={onClose}
                    className="flex items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 transition-colors hover:bg-surface-2"
                  >
                    <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {t(`actions.${action.key}.label`)}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        {t(`actions.${action.key}.description`)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {t('aboutPlatform')}
          </h3>

          <ul className="flex flex-wrap gap-1.5">
            {TOPICS.map((topic) => (
              <li key={topic}>
                <button
                  type="button"
                  onClick={() => setAnswer({ kind: 'topic', topic, reason: '', left: credits })}
                  className="rounded-full border border-[var(--pf-border)] px-3 py-1 text-xs transition-colors hover:border-accent/50 hover:text-accent"
                >
                  {t(`topics.${topic}.title`)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </>,
    document.body,
  );
}

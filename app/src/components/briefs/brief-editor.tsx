'use client';

import { Check, LayoutList, Loader2, Rows3, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useCallback, useEffect, useRef, useState } from 'react';

import {
  ART_STYLES,
  ASSET_TYPES,
  BRIEF_SECTION_KEYS,
  PLATFORMS,
  type BriefSections,
} from '@polyforge/shared';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { FormMessage } from '@/components/forms/form-message';
import { useActionRedirect } from '@/components/forms/use-action-redirect';
import { BriefAITools } from '@/components/briefs/ai-panels';
import { BriefClarifyChat } from '@/components/briefs/clarify-chat';
import { FieldHint } from '@/components/briefs/field-hint';
import {
  DeliverySection,
  GeneralSection,
  StyleSection,
  TechSection,
  TermsSection,
} from '@/components/briefs/brief-sections';
import { autosaveBrief, saveBrief } from '@/server/actions/briefs';
import { idleState } from '@/server/actions/types';
import { cn } from '@/lib/utils';

/**
 * Конструктор ТЗ (§4.4): мастер из пяти секций с прогресс-баром и режимом
 * «одной страницей» для опытных.
 *
 * Автосохранение через 1.5 с после последней правки. Оно не создаёт версию —
 * версия появляется по кнопке «Сохранить», иначе история распухнет.
 */

const AUTOSAVE_DELAY_MS = 1500;

const SECTION_COMPONENTS = {
  general: GeneralSection,
  style: StyleSection,
  tech: TechSection,
  delivery: DeliverySection,
  terms: TermsSection,
} as const;

export function BriefEditor({
  briefId,
  initialTitle,
  initialSections,
  isFrozen,
  aiIsLive,
  chatEnabled,
}: {
  briefId: string;
  initialTitle: string;
  initialSections: BriefSections;
  isFrozen: boolean;
  aiIsLive: boolean;
  /** Чат уточнений — post-MVP за флагом feature_brief_chat. */
  chatEnabled: boolean;
}) {
  const t = useTranslations('brief');
  const tSections = useTranslations('brief.sections');
  const tFields = useTranslations('brief.fields');
  const tRoot = useTranslations();

  const [title, setTitle] = useState(initialTitle);
  const [sections, setSections] = useState(initialSections);
  const [mode, setMode] = useState<'wizard' | 'page'>('wizard');
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [autosaving, setAutosaving] = useState(false);

  const [state, formAction, pending] = useActionState(saveBrief, idleState);
  useActionRedirect(state);

  // Свежее состояние для ИИ-вызовов: они читают то, что на экране сейчас.
  // Колбэк пересоздаётся вместе с данными — вызывают его в обработчиках,
  // так что лишних перерисовок это не даёт.
  const getDraft = useCallback(() => ({ title, sections }), [title, sections]);

  const update = useCallback((patch: Partial<BriefSections>) => {
    setSections((current) => ({ ...current, ...patch }));
  }, []);

  // Автосохранение с задержкой: сохраняем не каждый символ, а паузу в наборе.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (isFrozen) return;

    // Первый проход — это монтирование, а не правка пользователя.
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      setAutosaving(true);
      void autosaveBrief({ briefId, title, sections })
        .then((result) => {
          if (result.ok && result.savedAt) setSavedAt(result.savedAt);
        })
        .finally(() => setAutosaving(false));
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [briefId, title, sections, isFrozen]);

  /** Подстановка значения из замечания ИИ в конкретное поле. */
  const applySuggestion = useCallback((section: string, field: string, value: string) => {
    setSections((current) => {
      if (section === 'tech' && field === 'polyBudget') {
        return { ...current, tech: { ...current.tech, polyBudget: Number(value) || null } };
      }
      if (section === 'tech' && field === 'formats') {
        return {
          ...current,
          tech: { ...current.tech, formats: [...new Set([...current.tech.formats, value])] },
        };
      }
      if (section === 'tech' && field === 'textures') {
        return {
          ...current,
          tech: {
            ...current.tech,
            textures: {
              ...current.tech.textures,
              resolution: (['512', '1k', '2k', '4k', '8k'] as const).includes(
                value as '1k',
              )
                ? (value as BriefSections['tech']['textures']['resolution'])
                : current.tech.textures.resolution,
            },
          },
        };
      }
      if (section === 'delivery' && field === 'revisionRounds') {
        return {
          ...current,
          delivery: { ...current.delivery, revisionRounds: Number(value) || 0 },
        };
      }
      if (section === 'delivery' && field === 'deliverables') {
        return {
          ...current,
          delivery: {
            ...current.delivery,
            deliverables: [...new Set([...current.delivery.deliverables, value])],
          },
        };
      }
      if (section === 'terms' && field === 'budgetAmount') {
        return { ...current, terms: { ...current.terms, budgetAmount: Number(value) || null } };
      }

      // Поля, которые предлагает чат уточнений. Значения из перечислений
      // сверяются со справочником: модель может назвать несуществующий тип,
      // и подставить его в секцию — значит сломать её схему.
      if (section === 'general' && field === 'assetType') {
        return (ASSET_TYPES as readonly string[]).includes(value)
          ? {
              ...current,
              general: { ...current.general, assetType: value as BriefSections['general']['assetType'] },
            }
          : current;
      }
      if (section === 'general' && field === 'description') {
        // Дополняем, а не затираем: человек мог уже что-то написать.
        const existing = current.general.description.trim();
        return {
          ...current,
          general: {
            ...current.general,
            description: existing ? `${existing}\n${value}` : value,
          },
        };
      }
      if (section === 'tech' && field === 'platform') {
        return (PLATFORMS as readonly string[]).includes(value)
          ? { ...current, tech: { ...current.tech, platform: value as BriefSections['tech']['platform'] } }
          : current;
      }
      if (section === 'style' && field === 'styleTags') {
        return (ART_STYLES as readonly string[]).includes(value)
          ? {
              ...current,
              style: {
                ...current.style,
                styleTags: [
                  ...new Set([...current.style.styleTags, value as BriefSections['style']['styleTags'][number]]),
                ],
              },
            }
          : current;
      }

      // Для остальных полей замечание остаётся текстом: подставлять наугад хуже,
      // чем оставить решение пользователю.
      return current;
    });
  }, []);

  const hint = useCallback(
    (section: string, field: string, apply: (value: string) => void) => (
      <FieldHint
        briefId={briefId}
        section={section}
        field={field}
        getDraft={getDraft}
        onApply={apply}
      />
    ),
    [briefId, getDraft],
  );

  const visibleSections = mode === 'page' ? BRIEF_SECTION_KEYS : [BRIEF_SECTION_KEYS[step]!];
  const progress = ((step + 1) / BRIEF_SECTION_KEYS.length) * 100;

  return (
    <div className="flex flex-col gap-5">
      {isFrozen ? <Alert tone="warning">{t('frozen')}</Alert> : null}

      {/* Заголовок и статус автосохранения */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brief-title">{tFields('briefTitle')}</Label>
            <Input
              id="brief-title"
              value={title}
              disabled={isFrozen}
              maxLength={140}
              placeholder={tFields('briefTitleHint')}
              onChange={(event) => setTitle(event.target.value)}
              invalid={Boolean(state.fieldErrors?.title)}
            />
            {state.fieldErrors?.title ? (
              <p className="text-sm text-[var(--pf-danger)]">{tRoot(state.fieldErrors.title)}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              {autosaving ? (
                <>
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  {t('saving')}
                </>
              ) : savedAt ? (
                <>
                  <Check className="size-3 text-[var(--pf-success)]" aria-hidden />
                  {t('savedAt', {
                    time: new Date(savedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })}
                </>
              ) : null}
            </span>

            <div className="flex items-center gap-0.5 rounded-[var(--radius-control)] bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => setMode('wizard')}
                aria-pressed={mode === 'wizard'}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-medium transition-all',
                  mode === 'wizard' ? 'bg-surface text-fg shadow-[var(--shadow-soft)]' : 'text-fg-muted',
                )}
              >
                <Rows3 className="size-3.5" aria-hidden />
                {t('wizardMode')}
              </button>
              <button
                type="button"
                onClick={() => setMode('page')}
                aria-pressed={mode === 'page'}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-medium transition-all',
                  mode === 'page' ? 'bg-surface text-fg shadow-[var(--shadow-soft)]' : 'text-fg-muted',
                )}
              >
                <LayoutList className="size-3.5" aria-hidden />
                {t('pageMode')}
              </button>
            </div>
          </div>

          {mode === 'wizard' ? (
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="pf-gradient h-full transition-all duration-300 ease-[var(--ease-out-quick)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-fg-muted">
                {t('step', { current: step + 1, total: BRIEF_SECTION_KEYS.length })}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Секции */}
      {visibleSections.map((key) => {
        const SectionComponent = SECTION_COMPONENTS[key];
        return (
          <Card key={key}>
            <CardHeader>
              <CardTitle>{tSections(key)}</CardTitle>
            </CardHeader>
            <CardContent>
              <SectionComponent
                sections={sections}
                update={update}
                hint={hint}
                disabled={isFrozen}
              />
            </CardContent>
          </Card>
        );
      })}

      {mode === 'wizard' ? (
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            {t('prev')}
          </Button>
          <Button
            type="button"
            disabled={step >= BRIEF_SECTION_KEYS.length - 1}
            onClick={() =>
              setStep((current) => Math.min(BRIEF_SECTION_KEYS.length - 1, current + 1))
            }
          >
            {t('next')}
          </Button>
        </div>
      ) : null}

      {/* ИИ-инструменты */}
      <BriefAITools
        briefId={briefId}
        getDraft={getDraft}
        onApplySuggestion={applySuggestion}
        isLive={aiIsLive}
      />

      {/* Замороженное ТЗ правят только через BriefChangeRequest, и уточнять
          в нём нечего: подсказки некуда подставлять. */}
      {chatEnabled && !isFrozen ? (
        <BriefClarifyChat
          briefId={briefId}
          getDraft={getDraft}
          onApplySuggestion={applySuggestion}
        />
      ) : null}

      {/* Сохранение версии */}
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="briefId" value={briefId} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="sections" value={JSON.stringify(sections)} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-comment">{t('saveComment')}</Label>
          <Input
            id="brief-comment"
            name="comment"
            maxLength={200}
            disabled={isFrozen}
            placeholder={t('saveCommentHint')}
          />
        </div>

        <FormMessage state={state} />

        <Button type="submit" size="lg" loading={pending} disabled={isFrozen} className="sm:w-fit">
          <Save aria-hidden />
          {t('saveVersion')}
        </Button>
      </form>
    </div>
  );
}

'use client';

import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  ART_STYLES,
  ASSET_TYPES,
  CURRENCIES,
  ENGINE_PRESETS,
  FILE_FORMAT_PRESETS,
  type BriefSections,
} from '@polyforge/shared';

import { Button } from '@/components/ui/button';
import { ChipSelect } from '@/components/ui/chip-select';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { Textarea } from '@/components/ui/textarea';
import { FieldHint } from '@/components/briefs/field-hint';

/**
 * Пять секций конструктора ТЗ (§3, §4.4).
 *
 * Все секции управляемые: состояние живёт в редакторе, который отвечает за
 * автосохранение. Компоненты секций ничего не знают ни про сеть, ни про ИИ —
 * кнопка подсказки приходит извне пропсом `hint`.
 */

export interface SectionProps {
  sections: BriefSections;
  update: (patch: Partial<BriefSections>) => void;
  /** Кнопка «✨ ИИ подскажет» для конкретного поля. */
  hint: (section: string, field: string, apply: (value: string) => void) => React.ReactNode;
  disabled?: boolean;
}

const TEXTURE_RESOLUTIONS = ['512', '1k', '2k', '4k', '8k'] as const;
const PLATFORMS = ['pc', 'mobile', 'console', 'vr', 'web', 'any'] as const;
const RIGGING = ['none', 'basic', 'full', 'unknown'] as const;

export function GeneralSection({ sections, update, disabled }: SectionProps) {
  const t = useTranslations('brief.fields');
  const tTax = useTranslations('taxonomy');

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-assetType">{t('assetType')}</Label>
          <Select
            id="brief-assetType"
            disabled={disabled}
            value={sections.general.assetType ?? ''}
            onChange={(event) =>
              update({
                general: {
                  ...sections.general,
                  assetType: (event.target.value || null) as BriefSections['general']['assetType'],
                },
              })
            }
          >
            <option value="">—</option>
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {tTax(`assetType.${type}`)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-quantity">{t('quantity')}</Label>
          <Input
            id="brief-quantity"
            type="number"
            min={1}
            disabled={disabled}
            value={sections.general.quantity ?? ''}
            onChange={(event) =>
              update({
                general: {
                  ...sections.general,
                  quantity: event.target.value ? Number(event.target.value) : null,
                },
              })
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brief-description">{t('description')}</Label>
        <Textarea
          id="brief-description"
          rows={6}
          disabled={disabled}
          placeholder={t('descriptionHint')}
          value={sections.general.description}
          onChange={(event) =>
            update({ general: { ...sections.general, description: event.target.value } })
          }
        />
      </div>
    </div>
  );
}

export function StyleSection({ sections, update, disabled }: SectionProps) {
  const t = useTranslations('brief.fields');
  const tTax = useTranslations('taxonomy');

  const references = sections.style.references;

  function setReference(index: number, url: string) {
    const next = references.map((reference, position) =>
      position === index ? { ...reference, url } : reference,
    );
    update({ style: { ...sections.style, references: next } });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>{t('styleTags')}</Label>
        {/* ChipSelect некотролируемый — ключ сбрасывает его после ИИ-генерации. */}
        <ChipSelect
          key={sections.style.styleTags.join(',')}
          name="brief-styleTags"
          options={ART_STYLES}
          labels={Object.fromEntries(ART_STYLES.map((style) => [style, tTax(`style.${style}`)]))}
          defaultValue={sections.style.styleTags}
          max={6}
          onChange={(styleTags) => update({ style: { ...sections.style, styleTags } })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('references')}</Label>

        {references.map((reference, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={reference.url}
              disabled={disabled}
              placeholder={t('referenceUrl')}
              onChange={(event) => setReference(index, event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={t('references')}
              onClick={() =>
                update({
                  style: {
                    ...sections.style,
                    references: references.filter((_, position) => position !== index),
                  },
                })
              }
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || references.length >= 12}
          className="w-fit"
          onClick={() =>
            update({
              style: {
                ...sections.style,
                references: [...references, { kind: 'link' as const, url: '', note: '' }],
              },
            })
          }
        >
          <Plus aria-hidden />
          {t('addReference')}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brief-moodboard">{t('moodboardNote')}</Label>
        <Textarea
          id="brief-moodboard"
          rows={3}
          disabled={disabled}
          value={sections.style.moodboardNote}
          onChange={(event) =>
            update({ style: { ...sections.style, moodboardNote: event.target.value } })
          }
        />
      </div>
    </div>
  );
}

export function TechSection({ sections, update, hint, disabled }: SectionProps) {
  const t = useTranslations('brief.fields');
  const tBrief = useTranslations('brief');

  const tech = sections.tech;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-engine">{t('engine')}</Label>
          <Input
            id="brief-engine"
            list="engine-presets"
            disabled={disabled}
            value={tech.engine}
            onChange={(event) => update({ tech: { ...tech, engine: event.target.value } })}
          />
          <datalist id="engine-presets">
            {ENGINE_PRESETS.map((engine) => (
              <option key={engine} value={engine} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-platform">{t('platform')}</Label>
          <Select
            id="brief-platform"
            disabled={disabled}
            value={tech.platform ?? ''}
            onChange={(event) =>
              update({
                tech: {
                  ...tech,
                  platform: (event.target.value || null) as BriefSections['tech']['platform'],
                },
              })
            }
          >
            <option value="">—</option>
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {tBrief(`platform.${platform}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="brief-polyBudget">{t('polyBudget')}</Label>
          {hint('tech', 'polyBudget', (value) =>
            update({ tech: { ...tech, polyBudget: Number(value) || null } }),
          )}
        </div>
        <Input
          id="brief-polyBudget"
          type="number"
          min={0}
          className="font-mono"
          disabled={disabled}
          value={tech.polyBudget ?? ''}
          onChange={(event) =>
            update({
              tech: { ...tech, polyBudget: event.target.value ? Number(event.target.value) : null },
            })
          }
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>{t('formats')}</Label>
          {hint('tech', 'formats', (value) =>
            update({ tech: { ...tech, formats: [...new Set([...tech.formats, value])] } }),
          )}
        </div>
        <TagInput
          key={tech.formats.join(',')}
          name="brief-formats"
          presets={FILE_FORMAT_PRESETS}
          defaultValue={tech.formats}
          max={10}
          onChange={(formats) => update({ tech: { ...tech, formats } })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-textureResolution">{t('textureResolution')}</Label>
          <Select
            id="brief-textureResolution"
            disabled={disabled}
            value={tech.textures.resolution ?? ''}
            onChange={(event) =>
              update({
                tech: {
                  ...tech,
                  textures: {
                    ...tech.textures,
                    resolution: (event.target.value ||
                      null) as BriefSections['tech']['textures']['resolution'],
                  },
                },
              })
            }
          >
            <option value="">—</option>
            {TEXTURE_RESOLUTIONS.map((resolution) => (
              <option key={resolution} value={resolution}>
                {resolution.toUpperCase()}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-rigging">{t('rigging')}</Label>
          <Select
            id="brief-rigging"
            disabled={disabled}
            value={tech.rigging}
            onChange={(event) =>
              update({
                tech: { ...tech, rigging: event.target.value as BriefSections['tech']['rigging'] },
              })
            }
          >
            {RIGGING.map((option) => (
              <option key={option} value={option}>
                {tBrief(`rigging.${option}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          disabled={disabled}
          checked={tech.textures.pbrSet}
          onChange={(event) =>
            update({
              tech: { ...tech, textures: { ...tech.textures, pbrSet: event.target.checked } },
            })
          }
          className="size-4 accent-[var(--pf-accent)]"
        />
        {t('pbrSet')}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>{t('animationsList')}</Label>
          <TagInput
            key={tech.animationsList.join(',')}
            name="brief-animations"
            defaultValue={tech.animationsList}
            max={30}
            onChange={(animationsList) => update({ tech: { ...tech, animationsList } })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-lods">{t('lods')}</Label>
          <Input
            id="brief-lods"
            type="number"
            min={0}
            max={8}
            disabled={disabled}
            value={tech.lods ?? ''}
            onChange={(event) =>
              update({
                tech: { ...tech, lods: event.target.value ? Number(event.target.value) : null },
              })
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brief-textureNote">{t('textureNote')}</Label>
        <Input
          id="brief-textureNote"
          disabled={disabled}
          value={tech.textures.note}
          onChange={(event) =>
            update({ tech: { ...tech, textures: { ...tech.textures, note: event.target.value } } })
          }
        />
      </div>
    </div>
  );
}

export function DeliverySection({ sections, update, hint, disabled }: SectionProps) {
  const t = useTranslations('brief.fields');
  const delivery = sections.delivery;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label>{t('deliverables')}</Label>
        <TagInput
          key={delivery.deliverables.join(',')}
          name="brief-deliverables"
          defaultValue={delivery.deliverables}
          max={20}
          onChange={(deliverables) => update({ delivery: { ...delivery, deliverables } })}
        />
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          disabled={disabled}
          checked={delivery.sourcesIncluded}
          onChange={(event) =>
            update({ delivery: { ...delivery, sourcesIncluded: event.target.checked } })
          }
          className="size-4 accent-[var(--pf-accent)]"
        />
        {t('sourcesIncluded')}
      </label>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="brief-revisions">
            {t('revisionRounds')}
            <span className="ml-1 text-[var(--pf-danger)]">*</span>
          </Label>
          {hint('delivery', 'revisionRounds', (value) =>
            update({ delivery: { ...delivery, revisionRounds: Number(value) || 0 } }),
          )}
        </div>
        <Input
          id="brief-revisions"
          type="number"
          min={0}
          max={20}
          required
          disabled={disabled}
          className="font-mono sm:max-w-40"
          value={delivery.revisionRounds}
          onChange={(event) =>
            update({ delivery: { ...delivery, revisionRounds: Number(event.target.value) || 0 } })
          }
        />
        <p className="text-xs text-fg-muted">{t('revisionRoundsHint')}</p>
      </div>
    </div>
  );
}

export function TermsSection({ sections, update, disabled }: SectionProps) {
  const t = useTranslations('brief.fields');
  const terms = sections.terms;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-deadline">{t('deadline')}</Label>
          <Input
            id="brief-deadline"
            type="date"
            disabled={disabled}
            value={terms.deadline ?? ''}
            onChange={(event) =>
              update({ terms: { ...terms, deadline: event.target.value || null } })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brief-budgetMode">{t('budgetMode')}</Label>
          <Select
            id="brief-budgetMode"
            disabled={disabled}
            value={terms.budgetMode}
            onChange={(event) =>
              update({
                terms: { ...terms, budgetMode: event.target.value as 'fixed' | 'open' },
              })
            }
          >
            <option value="open">{t('budgetOpen')}</option>
            <option value="fixed">{t('budgetFixed')}</option>
          </Select>
        </div>
      </div>

      {terms.budgetMode === 'fixed' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brief-budgetAmount">{t('budgetAmount')}</Label>
            <Input
              id="brief-budgetAmount"
              type="number"
              min={0}
              disabled={disabled}
              value={terms.budgetAmount ?? ''}
              onChange={(event) =>
                update({
                  terms: {
                    ...terms,
                    budgetAmount: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brief-currency">{t('budgetCurrency')}</Label>
            <Select
              id="brief-currency"
              disabled={disabled}
              value={terms.budgetCurrency}
              onChange={(event) =>
                update({
                  terms: {
                    ...terms,
                    budgetCurrency: event.target.value as BriefSections['terms']['budgetCurrency'],
                  },
                })
              }
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brief-extraTerms">{t('extraTerms')}</Label>
        <Textarea
          id="brief-extraTerms"
          rows={3}
          disabled={disabled}
          value={terms.extraTerms}
          onChange={(event) =>
            update({ terms: { ...terms, extraTerms: event.target.value } })
          }
        />
      </div>
    </div>
  );
}

export { FieldHint };

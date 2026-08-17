import { ExternalLink } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import type { BriefSections } from '@polyforge/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Читаемое представление ТЗ. Одно и то же на приватной странице владельца и
 * на публичной по ссылке — расхождение между ними было бы источником
 * недоразумений: заказчик шарит одно, а видят другое.
 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--pf-border)] py-2 last:border-0">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

export async function BriefContent({ sections }: { sections: BriefSections }) {
  const [tCommon, tFields, tSections, tTax, tBrief] = await Promise.all([
    getTranslations('common'),
    getTranslations('brief.fields'),
    getTranslations('brief.sections'),
    getTranslations('taxonomy'),
    getTranslations('brief'),
  ]);

  const dash = '—';

  const budget =
    sections.terms.budgetMode === 'fixed' && sections.terms.budgetAmount !== null
      ? `${sections.terms.budgetAmount} ${sections.terms.budgetCurrency}`
      : tFields('budgetOpen');

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Общее */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{tSections('general')}</h2>

          <div className="flex flex-wrap gap-1.5">
            {sections.general.assetType ? (
              <Badge variant="accent">{tTax(`assetType.${sections.general.assetType}`)}</Badge>
            ) : null}
            {sections.style.styleTags.map((style) => (
              <Badge key={style} variant="outline">
                {tTax(`style.${style}`)}
              </Badge>
            ))}
          </div>

          {sections.general.description ? (
            <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
              {sections.general.description}
            </p>
          ) : null}

          {sections.general.quantity ? (
            <dl>
              <Row label={tFields('quantity')} value={String(sections.general.quantity)} />
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {/* 2. Стиль и референсы */}
      {sections.style.moodboardNote || sections.style.references.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{tSections('style')}</h2>

            {sections.style.moodboardNote ? (
              <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
                {sections.style.moodboardNote}
              </p>
            ) : null}

            {sections.style.references.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {sections.style.references
                  .filter((reference) => reference.url)
                  .map((reference, index) => (
                    <li key={`${reference.url}-${index}`}>
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                        {reference.url}
                      </a>
                    </li>
                  ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* 3. Технические требования */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{tSections('tech')}</h2>

          <dl className="flex flex-col">
            <Row label={tFields('engine')} value={sections.tech.engine || dash} />
            <Row
              label={tFields('platform')}
              value={sections.tech.platform ? tBrief(`platform.${sections.tech.platform}`) : dash}
            />
            <Row
              label={tFields('polyBudget')}
              value={sections.tech.polyBudget !== null ? sections.tech.polyBudget.toLocaleString() : dash}
            />
            <Row
              label={tFields('formats')}
              value={sections.tech.formats.length > 0 ? sections.tech.formats.join(', ') : dash}
            />
            <Row
              label={tFields('textureResolution')}
              value={
                [
                  sections.tech.textures.resolution?.toUpperCase(),
                  sections.tech.textures.pbrSet ? 'PBR' : null,
                  sections.tech.textures.note || null,
                ]
                  .filter(Boolean)
                  .join(' · ') || dash
              }
            />
            <Row
              label={tFields('rigging')}
              value={tBrief(`rigging.${sections.tech.rigging}`)}
            />
            {sections.tech.animationsList.length > 0 ? (
              <Row
                label={tFields('animationsList')}
                value={sections.tech.animationsList.join(', ')}
              />
            ) : null}
            {sections.tech.lods !== null ? (
              <Row label={tFields('lods')} value={String(sections.tech.lods)} />
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {/* 4. Состав сдачи */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{tSections('delivery')}</h2>

          <dl className="flex flex-col">
            <Row
              label={tFields('deliverables')}
              value={
                sections.delivery.deliverables.length > 0
                  ? sections.delivery.deliverables.join('; ')
                  : dash
              }
            />
            <Row
              label={tFields('sourcesIncluded')}
              value={sections.delivery.sourcesIncluded ? tCommon('yes') : tCommon('no')}
            />
            {/* Раунды правок — обязательное поле: показываем всегда. */}
            <Row
              label={tFields('revisionRounds')}
              value={String(sections.delivery.revisionRounds)}
            />
          </dl>
        </CardContent>
      </Card>

      {/* 5. Условия */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{tSections('terms')}</h2>

          <dl className="flex flex-col">
            <Row label={tFields('deadline')} value={sections.terms.deadline ?? dash} />
            <Row label={tFields('budgetMode')} value={budget} />
          </dl>

          {sections.terms.extraTerms ? (
            <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
              {sections.terms.extraTerms}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

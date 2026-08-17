import { existsSync } from 'node:fs';

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { prisma } from '@polyforge/db';
import { parseBriefSections, type BriefSections, type Locale } from '@polyforge/shared';
import { buildStorageKey } from '@polyforge/storage';

import { storage } from '../storage';
import { pdfLabels } from './brief-pdf-labels';

/**
 * Экспорт ТЗ в PDF (§4.4, фаза 2).
 *
 * Рендер через @react-pdf/renderer, а не через headless-браузер: браузер
 * добавил бы к образу воркера сотни мегабайт ради одного документа в час.
 *
 * Кириллицу встроенные шрифты PDF не покрывают, поэтому регистрируем DejaVu
 * из системного пакета fonts-dejavu-core.
 */

const FONT_CANDIDATES = [
  { regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' },
  { regular: '/usr/share/fonts/dejavu/DejaVuSans.ttf', bold: '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf' },
];

let fontRegistered = false;

function registerFont(): boolean {
  if (fontRegistered) return true;

  const found = FONT_CANDIDATES.find(
    (candidate) => existsSync(candidate.regular) && existsSync(candidate.bold),
  );

  if (!found) {
    console.error('[pdf] шрифт с кириллицей не найден — установите fonts-dejavu-core');
    return false;
  }

  Font.register({
    family: 'DejaVu',
    fonts: [
      { src: found.regular, fontWeight: 'normal' },
      { src: found.bold, fontWeight: 'bold' },
    ],
  });

  fontRegistered = true;
  return true;
}

const styles = StyleSheet.create({
  page: { fontFamily: 'DejaVu', fontSize: 10, padding: 44, color: '#12151d' },
  header: { borderBottomWidth: 2, borderBottomColor: '#7c5cff', paddingBottom: 12, marginBottom: 20 },
  brand: { fontSize: 9, color: '#7c5cff', fontWeight: 'bold', letterSpacing: 1, marginBottom: 6 },
  title: { fontSize: 20, fontWeight: 'bold', lineHeight: 1.25 },
  meta: { fontSize: 8, color: '#5b6376', marginTop: 6 },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#dfe3ec',
  },
  row: { flexDirection: 'row', marginBottom: 5 },
  label: { width: 150, color: '#5b6376' },
  value: { flex: 1 },
  paragraph: { lineHeight: 1.5, marginBottom: 6 },
  footer: {
    position: 'absolute',
    bottom: 26,
    left: 44,
    right: 44,
    fontSize: 7.5,
    color: '#5b6376',
    borderTopWidth: 1,
    borderTopColor: '#dfe3ec',
    paddingTop: 8,
    lineHeight: 1.4,
  },
});

/**
 * Подпись значения из словаря. Ключи приходят из JSON в БД, поэтому в словаре
 * их может не оказаться — тогда показываем сам ключ, а не пустое место.
 */
function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function BriefDocument({
  title,
  sections,
  locale,
  author,
  version,
  exportedAt,
}: {
  title: string;
  sections: BriefSections;
  locale: Locale;
  author: string;
  version: number;
  exportedAt: string;
}) {
  const t = pdfLabels(locale);
  const dash = '—';

  const budget =
    sections.terms.budgetMode === 'fixed' && sections.terms.budgetAmount !== null
      ? `${sections.terms.budgetAmount} ${sections.terms.budgetCurrency}`
      : t.budgetOpen;

  return (
    <Document title={title} author={author} creator="PolyForge">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>POLYFORGE</Text>
          <Text style={styles.title}>{title || t.untitled}</Text>
          <Text style={styles.meta}>
            {t.author}: {author} · {t.version} {version} · {exportedAt}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.general}</Text>
          <Row label={t.assetType} value={sections.general.assetType ? label(t.assetTypes, sections.general.assetType) : dash} />
          <Row label={t.quantity} value={sections.general.quantity ? String(sections.general.quantity) : dash} />
          {sections.general.description ? (
            <Text style={styles.paragraph}>{sections.general.description}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.style}</Text>
          <Row
            label={t.styleTags}
            value={
              sections.style.styleTags.length > 0
                ? sections.style.styleTags.map((tag) => label(t.styles, tag)).join(', ')
                : dash
            }
          />
          {sections.style.moodboardNote ? (
            <Text style={styles.paragraph}>{sections.style.moodboardNote}</Text>
          ) : null}
          {sections.style.references.map((reference, index) => (
            <Row key={`${reference.url}-${index}`} label={`${t.reference} ${index + 1}`} value={reference.url} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.tech}</Text>
          <Row label={t.engine} value={sections.tech.engine || dash} />
          <Row label={t.platform} value={sections.tech.platform ? label(t.platforms, sections.tech.platform) : dash} />
          <Row label={t.polyBudget} value={sections.tech.polyBudget !== null ? String(sections.tech.polyBudget) : dash} />
          <Row label={t.formats} value={sections.tech.formats.length > 0 ? sections.tech.formats.join(', ') : dash} />
          <Row
            label={t.textures}
            value={[
              sections.tech.textures.resolution ?? dash,
              sections.tech.textures.pbrSet ? t.pbrYes : t.pbrNo,
              sections.tech.textures.note,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <Row label={t.rigging} value={label(t.riggingValues, sections.tech.rigging)} />
          <Row
            label={t.animations}
            value={sections.tech.animationsList.length > 0 ? sections.tech.animationsList.join(', ') : dash}
          />
          <Row label={t.lods} value={sections.tech.lods !== null ? String(sections.tech.lods) : dash} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.delivery}</Text>
          <Row
            label={t.deliverables}
            value={sections.delivery.deliverables.length > 0 ? sections.delivery.deliverables.join('; ') : dash}
          />
          <Row label={t.sources} value={sections.delivery.sourcesIncluded ? t.yes : t.no} />
          <Row label={t.revisionRounds} value={String(sections.delivery.revisionRounds)} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.terms}</Text>
          <Row label={t.deadline} value={sections.terms.deadline ?? dash} />
          <Row label={t.budget} value={budget} />
          {sections.terms.extraTerms ? (
            <Text style={styles.paragraph}>{sections.terms.extraTerms}</Text>
          ) : null}
        </View>

        {/* Оговорка обязательна по §2.4: платформа не является стороной расчётов. */}
        <Text style={styles.footer} fixed>
          {t.disclaimer}
        </Text>
      </Page>
    </Document>
  );
}

export interface BriefPdfPayload {
  briefId: string;
  locale: Locale;
}

export async function generateBriefPdf(payload: BriefPdfPayload): Promise<void> {
  const brief = await prisma.brief.findUnique({
    where: { id: payload.briefId },
    select: {
      id: true,
      ownerId: true,
      title: true,
      sections: true,
      currentVersion: true,
      sourceLocale: true,
      owner: { select: { nickname: true } },
    },
  });

  // ТЗ могли удалить, пока задача ждала очереди.
  if (!brief) return;

  if (!registerFont()) {
    await prisma.brief.update({
      where: { id: brief.id },
      data: { pdfStatus: 'failed' },
    });
    return;
  }

  const locale = brief.sourceLocale;
  const exportedAt = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    dateStyle: 'medium',
  }).format(new Date());

  const buffer = await renderToBuffer(
    <BriefDocument
      title={brief.title}
      sections={parseBriefSections(brief.sections)}
      locale={locale}
      author={brief.owner.nickname}
      version={brief.currentVersion}
      exportedAt={exportedAt}
    />,
  );

  const key = buildStorageKey('briefs', brief.ownerId, 'pdf');
  await storage().put('public', key, buffer, { contentType: 'application/pdf' });

  await prisma.brief.update({
    where: { id: brief.id },
    data: {
      pdfStatus: 'ready',
      pdfUrl: storage().publicUrl(key),
      pdfStorageKey: key,
      pdfVersion: brief.currentVersion,
    },
  });
}

export async function markBriefPdfFailed(briefId: string): Promise<void> {
  await prisma.brief
    .update({ where: { id: briefId }, data: { pdfStatus: 'failed' } })
    .catch(() => undefined);
}

import { ImageResponse } from 'next/og';

import { getBriefByShareToken } from '@/server/briefs';

/** OG-карточка публичного ТЗ (§2.4): превью при шаринге в Discord и Telegram. */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'PolyForge';

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const brief = await getBriefByShareToken(token);

  const title = brief?.title || 'PolyForge';
  const description = brief?.sections.general.description.slice(0, 140) ?? '';
  const budget =
    brief && brief.sections.terms.budgetMode === 'fixed' && brief.sections.terms.budgetAmount
      ? `${brief.sections.terms.budgetAmount} ${brief.sections.terms.budgetCurrency}`
      : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0B0D12',
          color: '#E8EAF0',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'linear-gradient(100deg, #7C5CFF, #4CC9F0)',
            }}
          />
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>PolyForge</span>
          <span style={{ fontSize: 20, color: '#9AA1B2' }}>· бриф</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.1 }}>{title}</span>
          {description ? (
            <span style={{ fontSize: 26, color: '#9AA1B2', lineHeight: 1.35 }}>{description}</span>
          ) : null}
          {budget ? (
            <span style={{ fontSize: 24, color: '#4CC9F0' }}>{budget}</span>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            height: 8,
            borderRadius: 4,
            background: 'linear-gradient(100deg, #7C5CFF, #4CC9F0)',
          }}
        />
      </div>
    ),
    size,
  );
}

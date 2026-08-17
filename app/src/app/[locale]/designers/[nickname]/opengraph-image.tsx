import { ImageResponse } from 'next/og';

import { getPublicDesigner } from '@/server/profiles';

/**
 * OG-карточка профиля дизайнера (§2.4): красивое превью при шаринге
 * в Discord и Telegram.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'PolyForge';

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const designer = await getPublicDesigner(nickname);

  const title = designer?.nickname ?? 'PolyForge';
  const subtitle = designer?.profile.bio?.slice(0, 120) ?? 'PolyForge';

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
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>PolyForge</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>{title}</span>
          <span style={{ fontSize: 30, color: '#9AA1B2', lineHeight: 1.35 }}>{subtitle}</span>
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

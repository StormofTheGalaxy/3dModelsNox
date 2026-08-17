import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Единственный .env лежит в корне монорепо — тот же файл, что читает
// docker compose. Next по умолчанию смотрит только в каталог приложения.
const repoRoot = new URL('..', import.meta.url).pathname;
loadEnvConfig(repoRoot);

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Пакеты монорепо отдаются как TS-исходники — Next их транспилирует сам.
  transpilePackages: ['@polyforge/shared', '@polyforge/db'],

  // Prisma и argon2 тянут нативные бинарники: бандлить их нельзя.
  serverExternalPackages: ['@prisma/client', '@node-rs/argon2'],

  // Docker-образ: standalone-сборка со своим минимальным node_modules.
  output: 'standalone',
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.timeweb.cloud' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

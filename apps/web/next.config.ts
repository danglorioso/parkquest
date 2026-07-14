import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', 'sharp'],
  // sharp's native libvips binding lives two directories up in this pnpm-hoisted
  // monorepo (root node_modules/@img/*) — Turbopack's file tracer isn't picking
  // it up on its own, so the deployed function dlopen's a missing .so. Force it
  // into the /api/upload function's bundle explicitly.
  outputFileTracingIncludes: {
    '/api/upload': [
      '../../node_modules/@img/sharp-linux-x64/**/*',
      '../../node_modules/@img/sharp-libvips-linux-x64/**/*',
    ],
  },
  async rewrites() {
    return [
      // Next ignores dot-folders in app/, so the Apple Universal Links file
      // lives at an API route and is rewritten to its required path
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/api/apple-app-site-association',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
      {
        protocol: 'https',
        hostname: '*.clerk.accounts.dev',
      },
      {
        protocol: 'https',
        hostname: 'www.nps.gov',
      },
      {
        protocol: 'https',
        hostname: 'pub-ec7e74c5227e4ac5a31a7d7127604889.r2.dev',
      },
    ],
  },
};

export default nextConfig;

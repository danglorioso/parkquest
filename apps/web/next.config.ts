import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
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

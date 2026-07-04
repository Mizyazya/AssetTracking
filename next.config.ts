import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Потрібно для forbidden() у requireAdmin() (next/navigation).
    authInterrupts: true,
  },
};

export default nextConfig;

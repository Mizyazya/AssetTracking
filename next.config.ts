import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Потрібно для forbidden() у requireAdmin() (next/navigation).
    authInterrupts: true,
  },
};

export default nextConfig;

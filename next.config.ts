import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Потрібно для forbidden() у requireAdmin() (next/navigation).
    authInterrupts: true,
    // Сторінки з loading.tsx за замовчуванням кешують RSC-відповідь на 30с
    // у клієнтському Router Cache — ламає живі фільтри/пошук (застарілі
    // результати після зміни search params). 0 = завжди рефетчити.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;

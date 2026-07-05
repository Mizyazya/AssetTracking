import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Облік майна',
  description: 'Система обліку майна',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk" className="h-full bg-gray-50">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}

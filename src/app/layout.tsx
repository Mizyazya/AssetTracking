import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Облік майна',
  description: 'Система обліку майна',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

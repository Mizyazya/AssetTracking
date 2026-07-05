'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/', label: 'Майно' },
  { href: '/dashboard', label: 'Дашборд' },
  { href: '/people', label: 'Люди' },
  { href: '/locations', label: 'Локації' },
  { href: '/tasks', label: 'Задачі' },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

export default function AppNav({
  username,
  isAdmin,
  logout,
}: {
  username: string;
  isAdmin: boolean;
  logout: () => void | Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <nav className="app-nav">
      <div className="app-nav-links">
        <span className="app-brand">Облік майна</span>
        {navLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${isActive(pathname, href) ? ' active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="app-nav-actions">
        <form action="/search" style={{ display: 'flex' }}>
          <input
            name="q"
            placeholder="Пошук..."
            className="input"
            style={{ width: '10rem' }}
          />
        </form>
        {isAdmin && (
          <Link href="/users" className={`nav-link${isActive(pathname, '/users') ? ' active' : ''}`}>
            Адмін
          </Link>
        )}
        <Link href="/profile" className={`nav-link${isActive(pathname, '/profile') ? ' active' : ''}`}>
          {username}
        </Link>
        <form action={logout} style={{ marginLeft: 'var(--space-1)' }}>
          <button type="submit" className="btn ghost sm">Вийти</button>
        </form>
      </div>
    </nav>
  );
}

import Link from 'next/link';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/session';
import { logout } from '@/lib/auth-actions';
import { backupDatabase } from '@/lib/backup-action';

export const dynamic = 'force-dynamic';

const navLinks = [
  { href: '/', label: 'Майно' },
  { href: '/people', label: 'Люди' },
  { href: '/locations', label: 'Локації' },
  { href: '/tasks', label: 'Задачі' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const hdrs = await headers();
  const returnTo = hdrs.get('x-invoke-path') ?? '/';

  const pathname = hdrs.get('x-invoke-path') ?? '/';

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <nav className="app-nav">
        <div className="app-nav-links">
          <span className="app-brand">Облік майна</span>
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link${isActive(href) ? ' active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="app-nav-actions">
          {user.role === 'admin' && (
            <Link href="/users" className={`nav-link${isActive('/users') ? ' active' : ''}`}>
              Адмін
            </Link>
          )}
          <Link href="/profile" className={`nav-link${isActive('/profile') ? ' active' : ''}`}>
            {user.username}
          </Link>
          <form action={logout} style={{ marginLeft: 'var(--space-1)' }}>
            <button type="submit" className="btn ghost sm">Вийти</button>
          </form>
        </div>
      </nav>
      <main className="app-main">{children}</main>

      {user.role === 'admin' && (
        <footer className="app-footer">
          <form action={backupDatabase}>
            <input type="hidden" name="return_to" value={returnTo} />
            <button type="submit" className="btn ghost sm">Резервна копія БД</button>
          </form>
        </footer>
      )}
    </div>
  );
}

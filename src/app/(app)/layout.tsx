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

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-0 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-gray-900 py-3">Облік майна</span>
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="py-3 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-400"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-4">
          {user.role === 'admin' && (
            <Link href="/users" className="py-3 text-sm text-gray-600 hover:text-gray-900">
              Адмін
            </Link>
          )}
          <Link href="/profile" className="py-3 text-sm text-gray-600 hover:text-gray-900">
            {user.username}
          </Link>
          <form action={logout}>
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-900 underline">
              Вийти
            </button>
          </form>
        </div>
      </nav>
      <main className="flex-1 p-6">{children}</main>

      {user.role === 'admin' && (
        <footer className="border-t border-gray-200 bg-white px-6 py-3 flex justify-end">
          <form action={backupDatabase}>
            <input type="hidden" name="return_to" value={returnTo} />
            <button type="submit" className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              Резервна копія БД
            </button>
          </form>
        </footer>
      )}
    </div>
  );
}

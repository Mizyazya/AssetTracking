import { headers } from 'next/headers';
import { requireUser } from '@/lib/session';
import { logout } from '@/lib/auth-actions';
import { backupDatabase } from '@/lib/backup-action';
import AppNav from '@/components/AppNav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const hdrs = await headers();
  const returnTo = hdrs.get('x-invoke-path') ?? '/';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <AppNav username={user.username} isAdmin={user.role === 'admin'} logout={logout} />
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

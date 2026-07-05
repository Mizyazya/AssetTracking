import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { userSession } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { closeSession } from '@/lib/user-actions';
import { formatDateTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function MySessionsPage() {
  const { user } = await requireUser();
  const flash = await getFlash();

  const sessions = db
    .select()
    .from(userSession)
    .where(eq(userSession.userId, user.id))
    .orderBy(desc(userSession.loginTime))
    .all();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/profile" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>← Профіль</Link>
        <h1 className="mt-1 text-2xl font-semibold">Мої сесії</h1>
      </div>

      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      <div className="table-wrap overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Вхід</th>
              <th>Вихід</th>
              <th>IP</th>
              <th>User-Agent</th>
              <th>Статус</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-8)' }}>
                  Немає записів
                </td>
              </tr>
            )}
            {sessions.map(s => (
              <tr key={s.id}>
                <td className="whitespace-nowrap" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>
                  {formatDateTime(s.loginTime)}
                </td>
                <td className="whitespace-nowrap" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>
                  {s.logoutTime ? formatDateTime(s.logoutTime) : '—'}
                </td>
                <td style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>{s.ip ?? '—'}</td>
                <td className="max-w-xs truncate" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-disabled)' }}>
                  {s.userAgent ?? '—'}
                </td>
                <td>
                  <span className={`badge ${s.active ? 'success' : 'info'}`}>
                    {s.active ? 'Активна' : 'Завершена'}
                  </span>
                </td>
                <td>
                  {s.active && (
                    <form action={closeSession} className="inline">
                      <input type="hidden" name="session_id" value={s.id} />
                      <input type="hidden" name="return_to" value="/profile/sessions" />
                      <button type="submit" className="btn link danger sm">Завершити</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

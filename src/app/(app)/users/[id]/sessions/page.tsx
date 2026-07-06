import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { user, userSession } from '@/db/schema';
import { requireAdmin, sessionStatus, formatSessionIp } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { closeSession } from '@/lib/user-actions';
import { formatDateTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = { active: 'Активна', expired: 'Завершена (тайм-аут)', closed: 'Завершена' } as const;
const STATUS_BADGE = { active: 'success', expired: 'warning', closed: 'info' } as const;

export default async function UserSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const flash = await getFlash();

  const userId = parseInt(id);
  if (isNaN(userId)) notFound();

  const u = db.select().from(user).where(eq(user.id, userId)).get();
  if (!u) notFound();

  const sessions = db
    .select()
    .from(userSession)
    .where(eq(userSession.userId, userId))
    .orderBy(desc(userSession.loginTime))
    .all();

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/users/${userId}`} style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>← {u.username}</Link>
        <h1 className="mt-1 text-2xl font-semibold">Сесії</h1>
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
              <th>Статус</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-8)' }}>
                  Сесій немає
                </td>
              </tr>
            )}
            {sessions.map(s => {
              const status = sessionStatus(s);
              return (
                <tr key={s.id}>
                  <td className="whitespace-nowrap" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>
                    {formatDateTime(s.loginTime)}
                  </td>
                  <td className="whitespace-nowrap" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>
                    {s.logoutTime ? formatDateTime(s.logoutTime) : '—'}
                  </td>
                  <td style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>{formatSessionIp(s.ip)}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
                  </td>
                  <td>
                    {status === 'active' && (
                      <form action={closeSession} className="inline">
                        <input type="hidden" name="session_id" value={s.id} />
                        <input type="hidden" name="return_to" value={`/users/${userId}/sessions`} />
                        <button type="submit" className="btn link danger sm">Завершити</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

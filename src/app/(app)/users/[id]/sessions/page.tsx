import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { user, userSession } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { closeSession } from '@/lib/user-actions';
import { formatDateTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

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
      <div className="flex items-center gap-3">
        <Link href={`/users/${userId}`} className="text-sm text-gray-500 hover:text-gray-900">← {u.username}</Link>
        <h1 className="text-2xl font-semibold text-gray-900">Сесії</h1>
      </div>

      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {flash.message}
        </div>
      )}

      <SessionsTable sessions={sessions} returnTo={`/users/${userId}/sessions`} />
    </div>
  );
}

type Session = typeof userSession.$inferSelect;

function SessionsTable({
  sessions,
  returnTo,
}: {
  sessions: Session[];
  returnTo: string;
}) {
  const rows = sessions;

  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b border-gray-200 text-left text-gray-700">
            <th className="py-2 pr-4 font-medium">Вхід</th>
            <th className="py-2 pr-4 font-medium">Вихід</th>
            <th className="py-2 pr-4 font-medium">IP</th>
            <th className="py-2 pr-4 font-medium">Статус</th>
            <th className="py-2 font-medium">Дії</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} className="py-8 text-center text-gray-500">Сесій немає</td></tr>
          )}
          {rows.map(s => (
            <tr key={s.id} className="border-b border-gray-100">
              <td className="py-2 pr-4 text-xs text-gray-600">{formatDateTime(s.loginTime)}</td>
              <td className="py-2 pr-4 text-xs text-gray-600">{s.logoutTime ? formatDateTime(s.logoutTime) : '—'}</td>
              <td className="py-2 pr-4 text-xs text-gray-500">{s.ip ?? '—'}</td>
              <td className="py-2 pr-4">
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.active ? 'Активна' : 'Завершена'}
                </span>
              </td>
              <td className="py-2">
                {s.active && (
                  <form action={closeSession} className="inline">
                    <input type="hidden" name="session_id" value={s.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700">
                      Завершити
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

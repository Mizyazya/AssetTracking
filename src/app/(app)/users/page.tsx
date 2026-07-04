import Link from 'next/link';
import { db } from '@/db';
import { user, userSession } from '@/db/schema';
import { eq, count } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { deleteUser } from '@/lib/user-actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  await requireAdmin();
  const flash = await getFlash();

  const users = db.select().from(user).orderBy(user.username).all();

  // Active session count per user
  const sessionCounts = db
    .select({ userId: userSession.userId, cnt: count() })
    .from(userSession)
    .where(eq(userSession.active, true))
    .groupBy(userSession.userId)
    .all();
  const sessionCountMap = new Map(sessionCounts.map(r => [r.userId, r.cnt]));

  return (
    <div className="space-y-4">
      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {flash.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Користувачі</h1>
        <Link href="/users/new" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Додати
        </Link>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-gray-700">
              <th className="py-2 pr-4 font-medium">Логін</th>
              <th className="py-2 pr-4 font-medium">Роль</th>
              <th className="py-2 pr-4 font-medium">Активних сесій</th>
              <th className="py-2 font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4">
                  <Link href={`/users/${u.id}`} className="font-medium text-blue-600 hover:underline">
                    {u.username}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {u.role === 'admin' ? 'Адмін' : 'Користувач'}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <Link href={`/users/${u.id}/sessions`} className="text-blue-600 hover:underline">
                    {sessionCountMap.get(u.id) ?? 0}
                  </Link>
                </td>
                <td className="py-2">
                  <form action={deleteUser} className="inline">
                    <input type="hidden" name="user_id" value={u.id} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700">
                      Видалити
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

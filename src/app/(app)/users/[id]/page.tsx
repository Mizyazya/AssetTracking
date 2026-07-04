import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { editUser, deleteUser } from '@/lib/user-actions';

export const dynamic = 'force-dynamic';

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user: me } = await requireAdmin();
  const { id } = await params;
  const flash = await getFlash();

  const userId = parseInt(id);
  if (isNaN(userId)) notFound();

  const u = db.select().from(user).where(eq(user.id, userId)).get();
  if (!u) notFound();

  const isSelf = me.id === userId;

  const inputCls = 'block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
  const labelCls = 'block text-sm font-medium text-gray-700';

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/users" className="text-sm text-gray-500 hover:text-gray-900">← Користувачі</Link>
        <h1 className="text-2xl font-semibold text-gray-900">{u.username}</h1>
      </div>

      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
          {flash.message}
        </div>
      )}

      <form action={editUser} className="space-y-4 rounded border border-gray-200 bg-white p-6">
        <input type="hidden" name="user_id" value={u.id} />
        <div className="space-y-1">
          <label className={labelCls}>Логін</label>
          <input name="username" type="text" required defaultValue={u.username} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Новий пароль</label>
          <input name="password" type="password" placeholder="Залиште порожнім щоб не змінювати" className={inputCls} />
          <p className="text-xs text-gray-500">8–64 символи, велика + мала літера + цифра + спецсимвол</p>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Роль</label>
          {isSelf ? (
            <>
              <input type="hidden" name="role" value={u.role ?? 'user'} />
              <p className="text-sm text-gray-500">
                {u.role === 'admin' ? 'Адмін' : 'Користувач'} (не можна змінити власну роль)
              </p>
            </>
          ) : (
            <select name="role" defaultValue={u.role ?? 'user'} className={inputCls}>
              <option value="user">Користувач</option>
              <option value="admin">Адмін</option>
            </select>
          )}
        </div>
        <div className="flex gap-3">
          <button type="submit" className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Зберегти
          </button>
          <Link href={`/users/${u.id}/sessions`} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Сесії
          </Link>
        </div>
      </form>

      {!isSelf && (
        <form action={deleteUser}>
          <input type="hidden" name="user_id" value={u.id} />
          <button type="submit" className="w-full rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            Видалити користувача
          </button>
        </form>
      )}
    </div>
  );
}

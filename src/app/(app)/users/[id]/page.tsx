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

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <Link href="/users" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>← Користувачі</Link>
        <h1 className="mt-1 text-2xl font-semibold">{u.username}</h1>
      </div>

      {flash && (
        <div className={`alert ${flash.type === 'error' ? 'danger' : 'success'}`}>{flash.message}</div>
      )}

      <form action={editUser} className="card padded space-y-4">
        <input type="hidden" name="user_id" value={u.id} />
        <div className="field">
          <label className="field-label">Логін</label>
          <input name="username" type="text" required defaultValue={u.username} className="input" />
        </div>
        <div className="field">
          <label className="field-label">Новий пароль</label>
          <input name="password" type="password" placeholder="Залиште порожнім щоб не змінювати" className="input" />
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)', marginTop: 'var(--space-1)' }}>
            8–64 символи, велика + мала літера + цифра + спецсимвол
          </p>
        </div>
        <div className="field">
          <label className="field-label">Роль</label>
          {isSelf ? (
            <>
              <input type="hidden" name="role" value={u.role ?? 'user'} />
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>
                {u.role === 'admin' ? 'Адмін' : 'Користувач'} (не можна змінити власну роль)
              </p>
            </>
          ) : (
            <select name="role" defaultValue={u.role ?? 'user'} className="select">
              <option value="user">Користувач</option>
              <option value="admin">Адмін</option>
            </select>
          )}
        </div>
        <div className="flex gap-3">
          <button type="submit" className="btn secondary flex-1">Зберегти</button>
          <Link href={`/users/${u.id}/sessions`} className="btn outline">Сесії</Link>
        </div>
      </form>

      {!isSelf && (
        <form action={deleteUser}>
          <input type="hidden" name="user_id" value={u.id} />
          <button type="submit" className="btn danger outline block">Видалити користувача</button>
        </form>
      )}
    </div>
  );
}

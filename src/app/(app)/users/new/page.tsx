import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { addUser } from '@/lib/user-actions';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  await requireAdmin();
  const flash = await getFlash();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <Link href="/users" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>← Користувачі</Link>
        <h1 className="mt-1 text-2xl font-semibold">Новий користувач</h1>
      </div>

      {flash && (
        <div className={`alert ${flash.type === 'error' ? 'danger' : 'success'}`}>{flash.message}</div>
      )}

      <form action={addUser} className="card padded space-y-4">
        <div className="field">
          <label className="field-label">Логін <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input name="username" type="text" required className="input" />
        </div>
        <div className="field">
          <label className="field-label">Пароль <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input name="password" type="password" required className="input" />
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)', marginTop: 'var(--space-1)' }}>
            8–64 символи, велика + мала літера + цифра + спецсимвол
          </p>
        </div>
        <div className="field">
          <label className="field-label">Роль</label>
          <select name="role" className="select">
            <option value="user">Користувач</option>
            <option value="admin">Адмін</option>
          </select>
        </div>
        <button type="submit" className="btn primary block">Додати</button>
      </form>
    </div>
  );
}

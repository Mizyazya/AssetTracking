import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { changePassword } from '@/lib/user-actions';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { user } = await requireUser();
  const flash = await getFlash();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Профіль: {user.username}</h1>
        <Link href="/profile/sessions" className="btn ghost sm">Мої сесії →</Link>
      </div>

      {flash && (
        <div className={`alert ${flash.type === 'error' ? 'danger' : 'success'}`}>{flash.message}</div>
      )}

      <form action={changePassword} className="card padded space-y-4">
        <h2 className="font-medium">Змінити пароль</h2>
        <div className="field">
          <label className="field-label">Поточний пароль</label>
          <input name="current_password" type="password" required className="input" />
        </div>
        <div className="field">
          <label className="field-label">Новий пароль</label>
          <input name="new_password" type="password" required className="input" />
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)', marginTop: 'var(--space-1)' }}>
            8–64 символи, велика + мала літера + цифра + спецсимвол
          </p>
        </div>
        <button type="submit" className="btn primary block">Змінити пароль (вхід буде завершено)</button>
      </form>
    </div>
  );
}

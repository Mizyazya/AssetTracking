import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { addUser } from '@/lib/user-actions';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  await requireAdmin();
  const flash = await getFlash();

  const inputCls = 'block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
  const labelCls = 'block text-sm font-medium text-gray-700';

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/users" className="text-sm text-gray-500 hover:text-gray-900">← Користувачі</Link>
        <h1 className="text-2xl font-semibold text-gray-900">Новий користувач</h1>
      </div>

      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
          {flash.message}
        </div>
      )}

      <form action={addUser} className="space-y-4 rounded border border-gray-200 bg-white p-6">
        <div className="space-y-1">
          <label className={labelCls}>Логін <span className="text-red-500">*</span></label>
          <input name="username" type="text" required className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Пароль <span className="text-red-500">*</span></label>
          <input name="password" type="password" required className={inputCls} />
          <p className="text-xs text-gray-500">8–64 символи, велика + мала літера + цифра + спецсимвол</p>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Роль</label>
          <select name="role" className={inputCls}>
            <option value="user">Користувач</option>
            <option value="admin">Адмін</option>
          </select>
        </div>
        <button type="submit" className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Додати
        </button>
      </form>
    </div>
  );
}

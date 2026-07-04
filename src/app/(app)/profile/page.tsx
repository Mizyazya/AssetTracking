import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { changePassword } from '@/lib/user-actions';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { user } = await requireUser();
  const flash = await getFlash();

  const inputCls = 'block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
  const labelCls = 'block text-sm font-medium text-gray-700';

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Профіль: {user.username}</h1>
        <Link href="/profile/sessions" className="text-sm text-blue-600 hover:underline">
          Мої сесії →
        </Link>
      </div>

      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
          {flash.message}
        </div>
      )}

      <form action={changePassword} className="space-y-4 rounded border border-gray-200 bg-white p-6">
        <h2 className="font-medium text-gray-900">Змінити пароль</h2>
        <div className="space-y-1">
          <label className={labelCls}>Поточний пароль</label>
          <input name="current_password" type="password" required className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Новий пароль</label>
          <input name="new_password" type="password" required className={inputCls} />
          <p className="text-xs text-gray-500">8–64 символи, велика + мала літера + цифра + спецсимвол</p>
        </div>
        <button type="submit" className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Змінити пароль (вхід буде завершено)
        </button>
      </form>
    </div>
  );
}

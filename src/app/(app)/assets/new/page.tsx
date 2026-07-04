import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { addAsset } from '@/lib/asset-actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function NewAssetPage() {
  await requireUser();
  const flash = await getFlash();

  const inputCls =
    'block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelCls = 'block text-sm font-medium text-gray-700';

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
          ← Список майна
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Додати майно</h1>
      </div>

      {flash && (
        <div
          className={`rounded px-4 py-2 text-sm border ${flash.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}
        >
          {flash.message}
        </div>
      )}

      <form action={addAsset} className="space-y-4 rounded border border-gray-200 bg-white p-6">
        <div className="space-y-1">
          <label htmlFor="type" className={labelCls}>
            Тип
          </label>
          <select id="type" name="type" required className={inputCls}>
            <option value="active">Актив (одиничний)</option>
            <option value="component">Компонент (кількісний)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="name" className={labelCls}>
            Назва <span className="text-red-500">*</span>
          </label>
          <input id="name" name="name" type="text" required placeholder="Ноутбук Dell E6440" className={inputCls} />
        </div>

        <div className="space-y-1">
          <label htmlFor="serial" className={labelCls}>
            Серійний номер
          </label>
          <input
            id="serial"
            name="serial"
            type="text"
            placeholder="SN-12345 (для компонентів — необов'язково)"
            className={inputCls}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="quantity" className={labelCls}>
            Кількість (тільки для компонентів)
          </label>
          <input id="quantity" name="quantity" type="number" min="1" defaultValue="1" className={inputCls} />
        </div>

        <div className="space-y-1">
          <label htmlFor="comments" className={labelCls}>
            Коментар
          </label>
          <textarea id="comments" name="comments" rows={3} className={inputCls} />
        </div>

        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Додати
        </button>
      </form>
    </div>
  );
}

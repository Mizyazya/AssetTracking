import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { person, location, asset, assetLog } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { componentHolders } from '@/lib/ledger';
import { formatDateTime } from '@/lib/time';
import { editPerson, deletePerson } from '@/lib/people-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;
function str(v: string | string[] | undefined) { return Array.isArray(v) ? (v[0] ?? '') : (v ?? ''); }

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const flash = await getFlash();

  const personId = parseInt(id);
  if (isNaN(personId)) notFound();

  const p = db.select().from(person).where(eq(person.id, personId)).get();
  if (!p) notFound();

  const locations = db.select().from(location).all();
  const locMap = new Map(locations.map(l => [l.id, l]));

  // Active assets held by this person
  const activeAssets = db
    .select()
    .from(asset)
    .where(eq(asset.currentHolderId, personId))
    .all();

  // Component assets where this person has a ledger balance
  const components = db
    .select()
    .from(asset)
    .where(eq(asset.type, 'component'))
    .all()
    .map(a => ({ ...a, balance: componentHolders(a.id).get(personId) ?? 0 }))
    .filter(a => a.balance > 0);

  // History: asset_log entries for this person, newest first, paginated
  const hPage = Math.max(1, parseInt(str(sp.hpage)) || 1);
  const allLogs = db
    .select({
      id: assetLog.id,
      assetId: assetLog.assetId,
      action: assetLog.action,
      comment: assetLog.comment,
      timestamp: assetLog.timestamp,
      quantity: assetLog.quantity,
    })
    .from(assetLog)
    .where(eq(assetLog.personId, personId))
    .orderBy(desc(assetLog.timestamp))
    .all();

  const histTotal = allLogs.length;
  const histPages = Math.max(1, Math.ceil(histTotal / PAGE_SIZE));
  const curHPage = Math.min(hPage, histPages);
  const histSlice = allLogs.slice((curHPage - 1) * PAGE_SIZE, curHPage * PAGE_SIZE);

  // Asset names for history
  const allAssets = db.select({ id: asset.id, name: asset.name }).from(asset).all();
  const assetMap = new Map(allAssets.map(a => [a.id, a.name]));

  const inputCls = 'block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
  const labelCls = 'block text-sm font-medium text-gray-700';

  return (
    <div className="space-y-6">
      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {flash.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/people" className="text-sm text-gray-500 hover:text-gray-900">← Люди</Link>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{p.name}</h1>
          {p.phone && <p className="text-sm text-gray-500">{p.phone}</p>}
          {p.locationId && (
            <p className="text-sm text-gray-500">
              Локація:{' '}
              <Link href={`/locations/${p.locationId}`} className="text-blue-600 hover:underline">
                {locMap.get(p.locationId)?.name}
              </Link>
            </p>
          )}
        </div>
        <form action={deletePerson}>
          <input type="hidden" name="person_id" value={p.id} />
          <button type="submit" className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
            Видалити
          </button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT */}
        <div className="space-y-4">
          {/* Edit form */}
          <section className="rounded border border-gray-200 bg-white p-4 space-y-3">
            <h2 className="font-medium text-gray-900">Редагувати</h2>
            <form action={editPerson} className="space-y-3">
              <input type="hidden" name="person_id" value={p.id} />
              <div className="space-y-1">
                <label className={labelCls}>Ім'я</label>
                <input name="name" type="text" required defaultValue={p.name} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Телефон</label>
                <input name="phone" type="text" defaultValue={p.phone ?? ''} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Локація</label>
                <select name="location_id" defaultValue={p.locationId?.toString() ?? ''} className={inputCls}>
                  <option value="">Без локації</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <button type="submit" className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Зберегти
              </button>
            </form>
          </section>

          {/* Active assets */}
          <section className="rounded border border-gray-200 bg-white p-4 space-y-2">
            <h2 className="font-medium text-gray-900">Активи ({activeAssets.length})</h2>
            {activeAssets.length === 0 ? (
              <p className="text-sm text-gray-500">Немає активів</p>
            ) : (
              <ul className="space-y-1">
                {activeAssets.map(a => (
                  <li key={a.id} className="text-sm">
                    <Link href={`/assets/${a.id}`} className="text-blue-600 hover:underline">{a.name}</Link>
                    {a.serial && <span className="text-gray-500"> ({a.serial})</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Component balances */}
          {components.length > 0 && (
            <section className="rounded border border-gray-200 bg-white p-4 space-y-2">
              <h2 className="font-medium text-gray-900">Компоненти</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-700">
                    <th className="pb-1 pr-4 font-medium">Компонент</th>
                    <th className="pb-1 font-medium">Кількість</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map(c => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="py-1 pr-4">
                        <Link href={`/assets/${c.id}`} className="text-blue-600 hover:underline">{c.name}</Link>
                      </td>
                      <td className="py-1 font-medium">{c.balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        {/* RIGHT: History */}
        <section className="rounded border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="font-medium text-gray-900">
            Історія <span className="text-sm font-normal text-gray-500">({histTotal})</span>
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-700">
                <th className="pb-1 pr-3 font-medium">Дія</th>
                <th className="pb-1 pr-3 font-medium">Майно</th>
                <th className="pb-1 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {histSlice.map(log => (
                <tr key={log.id} className="border-b border-gray-100 align-top">
                  <td className="py-1.5 pr-3">
                    <span className="font-medium text-gray-800">{log.action}</span>
                    {log.quantity != null && <span className="text-gray-500 ml-1">×{log.quantity}</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Link href={`/assets/${log.assetId}`} className="text-blue-600 hover:underline text-xs">
                      {assetMap.get(log.assetId) ?? `#${log.assetId}`}
                    </Link>
                  </td>
                  <td className="py-1.5 text-xs text-gray-500 whitespace-nowrap">
                    {formatDateTime(log.timestamp)}
                  </td>
                </tr>
              ))}
              {histSlice.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-gray-500">Немає записів</td></tr>
              )}
            </tbody>
          </table>
          {histPages > 1 && (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: histPages }, (_, i) => i + 1).map(pg => (
                <a key={pg} href={`/people/${personId}?hpage=${pg}`}
                  className={`rounded px-2 py-0.5 text-xs ${pg === curHPage ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {pg}
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

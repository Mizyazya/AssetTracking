import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { location, person, asset } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { componentHolders } from '@/lib/ledger';
import { editLocation, deleteLocation } from '@/lib/people-actions';

export const dynamic = 'force-dynamic';

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const flash = await getFlash();

  const locationId = parseInt(id);
  if (isNaN(locationId)) notFound();

  const loc = db.select().from(location).where(eq(location.id, locationId)).get();
  if (!loc) notFound();

  // People at this location
  const persons = db.select().from(person).where(eq(person.locationId, locationId)).orderBy(person.name).all();
  const personIds = persons.map(p => p.id);

  // Active assets per person
  const activeAssets = db
    .select()
    .from(asset)
    .where(eq(asset.type, 'active'))
    .all()
    .filter(a => a.currentHolderId != null && personIds.includes(a.currentHolderId));

  // Component assets & ledger balances per person
  const components = db.select().from(asset).where(eq(asset.type, 'component')).all();
  type ComponentBalance = { asset: typeof components[0]; qty: number };
  const personComponents = new Map<number, ComponentBalance[]>();
  for (const c of components) {
    const holders = componentHolders(c.id);
    for (const pid of personIds) {
      const qty = holders.get(pid) ?? 0;
      if (qty > 0) {
        if (!personComponents.has(pid)) personComponents.set(pid, []);
        personComponents.get(pid)!.push({ asset: c, qty });
      }
    }
  }

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
          <Link href="/locations" className="text-sm text-gray-500 hover:text-gray-900">← Локації</Link>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{loc.name}</h1>
          <p className="text-sm text-gray-500">{persons.length} людей</p>
        </div>
        <form action={deleteLocation}>
          <input type="hidden" name="location_id" value={loc.id} />
          <button type="submit" className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
            Видалити
          </button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit form */}
        <section className="rounded border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="font-medium text-gray-900">Редагувати</h2>
          <form action={editLocation} className="space-y-3">
            <input type="hidden" name="location_id" value={loc.id} />
            <div className="space-y-1">
              <label className={labelCls}>Назва</label>
              <input name="name" type="text" required defaultValue={loc.name} className={inputCls} />
            </div>
            <button type="submit" className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              Зберегти
            </button>
          </form>
        </section>

        {/* People & their assets */}
        <section className="rounded border border-gray-200 bg-white p-4 space-y-4">
          <h2 className="font-medium text-gray-900">Люди та їх майно</h2>
          {persons.length === 0 && <p className="text-sm text-gray-500">Немає людей</p>}
          {persons.map(p => {
            const myAssets = activeAssets.filter(a => a.currentHolderId === p.id);
            const myComponents = personComponents.get(p.id) ?? [];
            return (
              <div key={p.id} className="space-y-1 border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <Link href={`/people/${p.id}`} className="font-medium text-blue-600 hover:underline">
                  {p.name}
                </Link>
                {p.phone && <span className="ml-2 text-xs text-gray-500">{p.phone}</span>}
                {myAssets.length === 0 && myComponents.length === 0 && (
                  <p className="text-xs text-gray-400">Немає майна</p>
                )}
                {myAssets.length > 0 && (
                  <ul className="ml-3 space-y-0.5">
                    {myAssets.map(a => (
                      <li key={a.id} className="text-sm">
                        <Link href={`/assets/${a.id}`} className="text-blue-600 hover:underline">{a.name}</Link>
                        {a.serial && <span className="text-gray-500"> ({a.serial})</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {myComponents.length > 0 && (
                  <ul className="ml-3 space-y-0.5">
                    {myComponents.map(c => (
                      <li key={c.asset.id} className="text-sm text-gray-600">
                        <Link href={`/assets/${c.asset.id}`} className="text-blue-600 hover:underline">{c.asset.name}</Link>
                        <span className="text-gray-500"> ×{c.qty}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

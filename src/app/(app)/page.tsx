import Link from 'next/link';
import { and, count, eq, like } from 'drizzle-orm';
import { db } from '@/db';
import { asset, location, person, task } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { holdersForAssets } from '@/lib/ledger';
import { formatDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function HomePage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const flash = await getFlash();

  const page = Math.max(1, parseInt(str(sp.page)) || 1);
  const fName = str(sp.name);
  const fSerial = str(sp.serial);
  const fType = str(sp.type);
  const fPersonId = sp.person_id ? parseInt(str(sp.person_id)) : null;
  const fLocationId = sp.location_id ? parseInt(str(sp.location_id)) : null;
  const sortBy = str(sp.sort) || 'created_at';
  const sortDir = str(sp.dir) || 'desc';

  // Build WHERE conditions for SQL
  const conds = [];
  if (fName) conds.push(like(asset.name, `%${fName}%`));
  if (fSerial) conds.push(like(asset.serial, `%${fSerial}%`));
  if (fType === 'active' || fType === 'component') conds.push(eq(asset.type, fType));

  const rawAssets = db
    .select()
    .from(asset)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .all();

  // Load reference data
  const persons = db.select().from(person).all();
  const locations = db.select().from(location).all();
  const personMap = new Map(persons.map(p => [p.id, p]));
  const locMap = new Map(locations.map(l => [l.id, l]));

  // Task counts for all assets
  const taskCountRows = db
    .select({ assetId: task.assetId, cnt: count() })
    .from(task)
    .where(eq(task.status, 'active'))
    .groupBy(task.assetId)
    .all();
  const taskCountMap = new Map(taskCountRows.map(r => [r.assetId, r.cnt]));

  // Ledger for all component assets
  const compIds = rawAssets.filter(a => a.type === 'component').map(a => a.id);
  const ledger = holdersForAssets(compIds);

  // Enrich with computed fields
  const enriched = rawAssets.map(a => {
    let holderPerson: { id: number; name: string; locationId: number | null } | null = null;
    let holderLocation: { id: number; name: string } | null = null;
    let compHolders: Array<{ id: number; name: string; qty: number; locName: string }> = [];
    let sortLocName = '';

    if (a.type === 'active' && a.currentHolderId) {
      const p = personMap.get(a.currentHolderId);
      if (p) {
        holderPerson = p;
        holderLocation = p.locationId ? (locMap.get(p.locationId) ?? null) : null;
        sortLocName = holderLocation?.name ?? '';
      }
    } else if (a.type === 'component') {
      const holders = ledger.get(a.id) ?? new Map();
      compHolders = Array.from(holders.entries())
        .map(([pid, qty]) => {
          const p = personMap.get(pid);
          if (!p) return null;
          const locName = p.locationId ? (locMap.get(p.locationId)?.name ?? '') : '';
          return { id: p.id, name: p.name, qty, locName };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      sortLocName = compHolders[0]?.locName ?? '';
    }

    return {
      ...a,
      holderPerson,
      holderLocation,
      compHolders,
      sortLocName,
      taskCount: taskCountMap.get(a.id) ?? 0,
    };
  });

  // Apply location/person filter (includes components via ledger)
  let filtered = enriched;
  if (fPersonId) {
    filtered = filtered.filter(a => {
      if (a.type === 'active') return a.currentHolderId === fPersonId;
      return a.compHolders.some(h => h.id === fPersonId);
    });
  }
  if (fLocationId) {
    filtered = filtered.filter(a => {
      if (a.type === 'active') return a.holderLocation?.id === fLocationId;
      return a.compHolders.some(h => {
        const p = personMap.get(h.id);
        return p?.locationId === fLocationId;
      });
    });
  }

  // Sort
  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name, 'uk');
    else if (sortBy === 'task_count') cmp = a.taskCount - b.taskCount;
    else if (sortBy === 'location') cmp = a.sortLocName.localeCompare(b.sortLocName, 'uk');
    else cmp = (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const slice = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  function buildUrl(overrides: Record<string, string | number | null | undefined>) {
    const base: Record<string, string> = {};
    if (fName) base.name = fName;
    if (fSerial) base.serial = fSerial;
    if (fType) base.type = fType;
    if (fPersonId) base.person_id = String(fPersonId);
    if (fLocationId) base.location_id = String(fLocationId);
    base.sort = sortBy;
    base.dir = sortDir;
    base.page = String(curPage);
    const merged = { ...base, ...overrides };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '') p.set(k, String(v));
    }
    const qs = p.toString();
    return qs ? `/?${qs}` : '/';
  }

  function sortLink(col: string) {
    const newDir = sortBy === col && sortDir === 'desc' ? 'asc' : 'desc';
    return buildUrl({ sort: col, dir: newDir, page: '1' });
  }

  function arrow(col: string) {
    if (sortBy !== col) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  }

  const inputCls = 'rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900';

  return (
    <div className="space-y-4">
      {flash && (
        <div
          className={`rounded px-4 py-2 text-sm border ${flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}
        >
          {flash.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Облік майна</h1>
        <Link
          href="/assets/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Додати майно
        </Link>
      </div>

      {/* Filters */}
      <form method="get" className="rounded border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <input name="name" defaultValue={fName} placeholder="Назва" className={inputCls} />
          <input name="serial" defaultValue={fSerial} placeholder="Серійний номер" className={inputCls} />
          <select name="type" defaultValue={fType} className={inputCls}>
            <option value="">Тип: усі</option>
            <option value="active">Актив</option>
            <option value="component">Компонент</option>
          </select>
          <select name="person_id" defaultValue={fPersonId?.toString() ?? ''} className={inputCls}>
            <option value="">Держатель: усі</option>
            {persons.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="location_id" defaultValue={fLocationId?.toString() ?? ''} className={inputCls}>
            <option value="">Локація: усі</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700">
            Фільтр
          </button>
          <Link href="/" className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">
            Скинути
          </Link>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-gray-700">
              <th className="pb-2 pr-4 font-medium">
                <a href={sortLink('name')} className="hover:text-gray-900">
                  Назва{arrow('name')}
                </a>
              </th>
              <th className="pb-2 pr-4 font-medium">Серійний номер</th>
              <th className="pb-2 pr-4 font-medium">Тип</th>
              <th className="pb-2 pr-4 font-medium">
                <a href={sortLink('location')} className="hover:text-gray-900">
                  Держатель / Локація{arrow('location')}
                </a>
              </th>
              <th className="pb-2 pr-4 font-medium">
                <a href={sortLink('task_count')} className="hover:text-gray-900">
                  Задачі{arrow('task_count')}
                </a>
              </th>
              <th className="pb-2 font-medium">
                <a href={sortLink('created_at')} className="hover:text-gray-900">
                  Дата{arrow('created_at')}
                </a>
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  Нічого не знайдено
                </td>
              </tr>
            )}
            {slice.map(a => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4">
                  <Link href={`/assets/${a.id}`} className="font-medium text-blue-600 hover:underline">
                    {a.name}
                  </Link>
                  {a.comments && <span className="block truncate max-w-xs text-xs text-gray-500">{a.comments}</span>}
                </td>
                <td className="py-2 pr-4 text-gray-600">{a.serial ?? '—'}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${a.type === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}
                  >
                    {a.type === 'active' ? 'Актив' : 'Компонент'}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  {a.type === 'active' ? (
                    a.holderPerson ? (
                      <span>
                        <Link href={`/people/${a.holderPerson.id}`} className="text-blue-600 hover:underline">
                          {a.holderPerson.name}
                        </Link>
                        {a.holderLocation && (
                          <span className="text-gray-500"> / {a.holderLocation.name}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">На складі</span>
                    )
                  ) : a.compHolders.length > 0 ? (
                    <div className="space-y-0.5">
                      {a.compHolders.map(h => (
                        <div key={h.id}>
                          <Link href={`/people/${h.id}`} className="text-blue-600 hover:underline">
                            {h.name}
                          </Link>
                          <span className="text-gray-500"> ×{h.qty}</span>
                          {h.locName && <span className="text-gray-400"> / {h.locName}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">На складі ({a.quantity ?? 0})</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {a.taskCount > 0 ? (
                    <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {a.taskCount}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 text-gray-500">{formatDate(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <a
              key={p}
              href={buildUrl({ page: p })}
              className={`rounded px-3 py-1 text-sm ${p === curPage ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {p}
            </a>
          ))}
        </div>
      )}

      <p className="text-sm text-gray-500">Всього: {total}</p>
    </div>
  );
}

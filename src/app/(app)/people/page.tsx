import Link from 'next/link';
import { eq, like, and } from 'drizzle-orm';
import { db } from '@/db';
import { person, location, asset } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { addPerson, deletePerson } from '@/lib/people-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;
function str(v: string | string[] | undefined) {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function PeoplePage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const flash = await getFlash();

  const page = Math.max(1, parseInt(str(sp.page)) || 1);
  const fSearch = str(sp.search);
  const fLocationId = sp.location_id ? parseInt(str(sp.location_id)) : null;
  const fHasAssets = str(sp.has_assets); // 'yes' | 'no' | ''

  const locations = db.select().from(location).all();
  const locMap = new Map(locations.map(l => [l.id, l]));

  // Fetch persons with optional filters
  const conds = [];
  if (fSearch) conds.push(like(person.name, `%${fSearch}%`));
  if (fLocationId === 0) {
    // 'none' — без локації
    conds.push(eq(person.locationId, null as unknown as number));
  } else if (fLocationId) {
    conds.push(eq(person.locationId, fLocationId));
  }

  const persons = db
    .select()
    .from(person)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(person.name)
    .all();

  // Filter by has_assets (PORTING.md §7.2: only checks current_holder_id, not ledger)
  const assetHolders = new Set(
    db
      .select({ id: asset.currentHolderId })
      .from(asset)
      .where(eq(asset.type, 'active'))
      .all()
      .map(r => r.id)
      .filter((id): id is number => id != null),
  );

  let filtered = persons;
  if (fHasAssets === 'yes') filtered = persons.filter(p => assetHolders.has(p.id));
  if (fHasAssets === 'no') filtered = persons.filter(p => !assetHolders.has(p.id));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const slice = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  // Active filter description (PORTING.md §7.2)
  const filterDesc: string[] = [];
  if (fLocationId === 0) filterDesc.push('Локація: без локації');
  else if (fLocationId) filterDesc.push(`Локація: ${locMap.get(fLocationId)?.name ?? fLocationId}`);
  if (fSearch) filterDesc.push(`Пошук: '${fSearch}'`);
  if (fHasAssets === 'yes') filterDesc.push('Має майно');
  if (fHasAssets === 'no') filterDesc.push('Немає майна');

  function buildUrl(overrides: Record<string, string | number | null | undefined>) {
    const base: Record<string, string> = {};
    if (fSearch) base.search = fSearch;
    if (fLocationId != null) base.location_id = String(fLocationId);
    if (fHasAssets) base.has_assets = fHasAssets;
    base.page = String(curPage);
    const p = new URLSearchParams({ ...base, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])) });
    return `/people?${p.toString()}`;
  }

  const inputCls = 'rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900';

  return (
    <div className="space-y-4">
      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {flash.message}
        </div>
      )}

      <h1 className="text-2xl font-semibold text-gray-900">Люди</h1>

      {/* Filters */}
      <form method="get" action="/people" className="rounded border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <input name="search" defaultValue={fSearch} placeholder="Пошук за іменем" className={inputCls} />
          <select name="location_id" defaultValue={fLocationId?.toString() ?? ''} className={inputCls}>
            <option value="">Локація: усі</option>
            <option value="0">Без локації</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select name="has_assets" defaultValue={fHasAssets} className={inputCls}>
            <option value="">Майно: усі</option>
            <option value="yes">Має майно</option>
            <option value="no">Немає майна</option>
          </select>
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700">
            Фільтр
          </button>
          <Link href="/people" className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">
            Скинути
          </Link>
        </div>
        {filterDesc.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">{filterDesc.join(' · ')}</p>
        )}
      </form>

      {/* Add person form */}
      <details className="rounded border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer font-medium text-gray-900 hover:text-blue-600">
          + Додати людину
        </summary>
        <form action={addPerson} className="mt-3 flex flex-wrap gap-3">
          <input name="name" type="text" required placeholder="Ім'я *" className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 w-48" />
          <input name="phone" type="text" placeholder="Телефон" className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 w-36" />
          <select name="location_id" className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900">
            <option value="">Без локації</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Додати
          </button>
        </form>
      </details>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-gray-700">
              <th className="py-2 pr-4 font-medium">Ім'я</th>
              <th className="py-2 pr-4 font-medium">Локація</th>
              <th className="py-2 pr-4 font-medium">Телефон</th>
              <th className="py-2 font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-gray-500">Нікого не знайдено</td></tr>
            )}
            {slice.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4">
                  <Link href={`/people/${p.id}`} className="font-medium text-blue-600 hover:underline">
                    {p.name}
                  </Link>
                  {assetHolders.has(p.id) && (
                    <span className="ml-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">є майно</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  {p.locationId ? locMap.get(p.locationId)?.name ?? '—' : '—'}
                </td>
                <td className="py-2 pr-4 text-gray-600">{p.phone ?? '—'}</td>
                <td className="py-2">
                  <form action={deletePerson} className="inline">
                    <input type="hidden" name="person_id" value={p.id} />
                    <button
                      type="submit"
                      className="text-xs text-red-500 hover:text-red-700"
                      onClick={() => {}}
                    >
                      Видалити
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <a key={p} href={buildUrl({ page: p })}
              className={`rounded px-3 py-1 text-sm ${p === curPage ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {p}
            </a>
          ))}
        </div>
      )}
      <p className="text-sm text-gray-500">Всього: {total}</p>
    </div>
  );
}

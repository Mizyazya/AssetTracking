import Link from 'next/link';
import { eq, like, and, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { task, asset, person, location } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { closeTask } from '@/lib/asset-actions';
import { formatDateTime, formatDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;
function str(v: string | string[] | undefined) { return Array.isArray(v) ? (v[0] ?? '') : (v ?? ''); }

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const flash = await getFlash();

  const page = Math.max(1, parseInt(str(sp.page)) || 1);
  const fLocationId = sp.location_id ? parseInt(str(sp.location_id)) : null;
  const fPersonId = sp.person_id ? parseInt(str(sp.person_id)) : null;
  const fAssetName = str(sp.asset_name);
  const fTaskText = str(sp.task_text);
  const fDateFrom = str(sp.date_from);
  const fDateTo = str(sp.date_to);
  const fClosedFrom = str(sp.closed_from);
  const fClosedTo = str(sp.closed_to);

  // Reference data
  const persons = db.select().from(person).orderBy(person.name).all();
  const locations = db.select().from(location).orderBy(location.name).all();
  const personMap = new Map(persons.map(p => [p.id, p]));
  const locMap = new Map(locations.map(l => [l.id, l]));

  // All active-type assets (tasks only exist for active assets)
  const assets = db.select().from(asset).where(eq(asset.type, 'active')).all();
  const assetMap = new Map(assets.map(a => [a.id, a]));

  // SQL-level task filter conditions
  const taskConds = [];
  if (fAssetName) taskConds.push(like(asset.name, `%${fAssetName}%`));
  if (fTaskText) taskConds.push(like(task.text, `%${fTaskText}%`));
  if (fDateFrom) taskConds.push(gte(task.createdAt, fDateFrom));
  if (fDateTo) taskConds.push(lte(task.createdAt, fDateTo + 'T23:59:59'));

  // Fetch all tasks joined with asset
  const allTasks = db
    .select({
      id: task.id,
      assetId: task.assetId,
      text: task.text,
      status: task.status,
      createdAt: task.createdAt,
      closedAt: task.closedAt,
      closeComment: task.closeComment,
      assetName: asset.name,
      currentHolderId: asset.currentHolderId,
    })
    .from(task)
    .innerJoin(asset, and(eq(task.assetId, asset.id), eq(asset.type, 'active')))
    .where(taskConds.length > 0 ? and(...taskConds) : undefined)
    .all();

  // Post-filter by holder location / person
  const filtered = allTasks.filter(t => {
    if (fPersonId && t.currentHolderId !== fPersonId) return false;
    if (fLocationId) {
      const holder = t.currentHolderId ? personMap.get(t.currentHolderId) : null;
      if (holder?.locationId !== fLocationId) return false;
    }
    return true;
  });

  // Split active / closed, apply date filters
  let active = filtered
    .filter(t => t.status === 'active')
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  let closed = filtered
    .filter(t => {
      if (t.status !== 'closed') return false;
      if (fClosedFrom && (t.closedAt ?? '') < fClosedFrom) return false;
      if (fClosedTo && (t.closedAt ?? '') > fClosedTo + 'T23:59:59') return false;
      return true;
    })
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));

  // Pagination — shared page param, each section independently (PORTING.md §7.3)
  const activePages = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const closedPages = Math.max(1, Math.ceil(closed.length / PAGE_SIZE));
  const curPage = Math.min(page, Math.max(activePages, closedPages));

  const activeSlice = active.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const closedSlice = closed.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const totalPages = Math.max(activePages, closedPages);

  // Group active tasks by asset
  const groupedActive = new Map<number, typeof activeSlice>();
  for (const t of activeSlice) {
    if (!groupedActive.has(t.assetId)) groupedActive.set(t.assetId, []);
    groupedActive.get(t.assetId)!.push(t);
  }

  function buildUrl(overrides: Record<string, string | number | null | undefined>) {
    const base: Record<string, string> = {};
    if (fLocationId) base.location_id = String(fLocationId);
    if (fPersonId) base.person_id = String(fPersonId);
    if (fAssetName) base.asset_name = fAssetName;
    if (fTaskText) base.task_text = fTaskText;
    if (fDateFrom) base.date_from = fDateFrom;
    if (fDateTo) base.date_to = fDateTo;
    if (fClosedFrom) base.closed_from = fClosedFrom;
    if (fClosedTo) base.closed_to = fClosedTo;
    base.page = String(curPage);
    const merged = { ...base };
    for (const [k, v] of Object.entries(overrides)) {
      if (v != null && v !== '') merged[k] = String(v);
      else delete merged[k];
    }
    const p = new URLSearchParams(merged);
    return `/tasks?${p.toString()}`;
  }

  const inputCls = 'rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900';

  return (
    <div className="space-y-6">
      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {flash.message}
        </div>
      )}

      <h1 className="text-2xl font-semibold text-gray-900">Задачі</h1>

      {/* Filters */}
      <form method="get" action="/tasks" className="rounded border border-gray-200 bg-white p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input name="asset_name" defaultValue={fAssetName} placeholder="Назва майна" className={inputCls} />
          <input name="task_text" defaultValue={fTaskText} placeholder="Текст задачі" className={inputCls} />
          <select name="person_id" defaultValue={fPersonId?.toString() ?? ''} className={inputCls}>
            <option value="">Держатель: усі</option>
            {persons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="location_id" defaultValue={fLocationId?.toString() ?? ''} className={inputCls}>
            <option value="">Локація: усі</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm text-gray-600">
          <span>Створено:</span>
          <input name="date_from" type="date" defaultValue={fDateFrom} className={inputCls} />
          <span>—</span>
          <input name="date_to" type="date" defaultValue={fDateTo} className={inputCls} />
          <span className="ml-4">Закрито:</span>
          <input name="closed_from" type="date" defaultValue={fClosedFrom} className={inputCls} />
          <span>—</span>
          <input name="closed_to" type="date" defaultValue={fClosedTo} className={inputCls} />
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700">
            Фільтр
          </button>
          <Link href="/tasks" className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">
            Скинути
          </Link>
        </div>
      </form>

      {/* ── Active tasks ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-900">
          Активні задачі{' '}
          <span className="text-sm font-normal text-gray-500">({active.length})</span>
        </h2>

        {activeSlice.length === 0 && (
          <p className="text-sm text-gray-500 rounded border border-gray-200 bg-white px-4 py-6 text-center">
            Активних задач немає
          </p>
        )}

        {Array.from(groupedActive.entries()).map(([assetId, tasks]) => {
          const a = assetMap.get(assetId);
          const holder = a?.currentHolderId ? personMap.get(a.currentHolderId) : null;
          const holderLoc = holder?.locationId ? locMap.get(holder.locationId) : null;
          return (
            <div key={assetId} className="rounded border border-gray-200 bg-white">
              {/* Asset header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 bg-gray-50">
                <Link href={`/assets/${assetId}`} className="font-medium text-blue-600 hover:underline">
                  {a?.name ?? `#${assetId}`}
                </Link>
                {holder && (
                  <span className="text-sm text-gray-500">
                    <Link href={`/people/${holder.id}`} className="hover:underline">{holder.name}</Link>
                    {holderLoc && <span> / {holderLoc.name}</span>}
                  </span>
                )}
              </div>
              {/* Tasks */}
              <ul className="divide-y divide-gray-100">
                {tasks.map(t => (
                  <li key={t.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <p className="text-sm text-gray-900">{t.text}</p>
                        <p className="text-xs text-gray-500">Створено: {formatDateTime(t.createdAt)}</p>
                      </div>
                      <form action={closeTask} className="flex gap-2 items-center flex-shrink-0">
                        <input type="hidden" name="task_id" value={t.id} />
                        <input type="hidden" name="asset_id" value={t.assetId} />
                        <input type="hidden" name="return_to" value="/tasks" />
                        <input
                          name="close_comment"
                          type="text"
                          placeholder="Коментар"
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 w-36"
                        />
                        <button type="submit" className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 whitespace-nowrap">
                          Закрити
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* ── Closed tasks ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-900">
          Закриті задачі{' '}
          <span className="text-sm font-normal text-gray-500">({closed.length})</span>
        </h2>

        {closedSlice.length === 0 && (
          <p className="text-sm text-gray-500 rounded border border-gray-200 bg-white px-4 py-6 text-center">
            Закритих задач немає
          </p>
        )}

        {closedSlice.length > 0 && (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 pr-4 font-medium">Задача</th>
                  <th className="py-2 pr-4 font-medium">Майно</th>
                  <th className="py-2 pr-4 font-medium">Закрито</th>
                  <th className="py-2 font-medium">Коментар</th>
                </tr>
              </thead>
              <tbody>
                {closedSlice.map(t => {
                  const a = assetMap.get(t.assetId);
                  return (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                      <td className="py-2 pr-4 text-gray-600 line-through">{t.text}</td>
                      <td className="py-2 pr-4">
                        <Link href={`/assets/${t.assetId}`} className="text-blue-600 hover:underline">
                          {a?.name ?? `#${t.assetId}`}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(t.closedAt)}
                      </td>
                      <td className="py-2 text-xs text-gray-500">{t.closeComment ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shared pagination */}
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
    </div>
  );
}

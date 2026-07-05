import Link from 'next/link';
import { eq, like, and, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { task, asset, person, location } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { closeTask } from '@/lib/asset-actions';
import { formatDateTime, formatDate } from '@/lib/time';
import { AutoSubmitForm } from '@/components/AutoSubmitForm';

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

  const persons = db.select().from(person).orderBy(person.name).all();
  const locations = db.select().from(location).orderBy(location.name).all();
  const personMap = new Map(persons.map(p => [p.id, p]));
  const locMap = new Map(locations.map(l => [l.id, l]));

  const assets = db.select().from(asset).where(eq(asset.type, 'active')).all();
  const assetMap = new Map(assets.map(a => [a.id, a]));

  const taskConds = [];
  if (fAssetName) taskConds.push(like(asset.name, `%${fAssetName}%`));
  if (fTaskText) taskConds.push(like(task.text, `%${fTaskText}%`));
  if (fDateFrom) taskConds.push(gte(task.createdAt, fDateFrom));
  if (fDateTo) taskConds.push(lte(task.createdAt, fDateTo + 'T23:59:59'));

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

  const filtered = allTasks.filter(t => {
    if (fPersonId && t.currentHolderId !== fPersonId) return false;
    if (fLocationId) {
      const holder = t.currentHolderId ? personMap.get(t.currentHolderId) : null;
      if (holder?.locationId !== fLocationId) return false;
    }
    return true;
  });

  const active = filtered
    .filter(t => t.status === 'active')
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  const closed = filtered
    .filter(t => {
      if (t.status !== 'closed') return false;
      if (fClosedFrom && (t.closedAt ?? '') < fClosedFrom) return false;
      if (fClosedTo && (t.closedAt ?? '') > fClosedTo + 'T23:59:59') return false;
      return true;
    })
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));

  const activePages = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const closedPages = Math.max(1, Math.ceil(closed.length / PAGE_SIZE));
  const curPage = Math.min(page, Math.max(activePages, closedPages));

  const activeSlice = active.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const closedSlice = closed.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const totalPages = Math.max(activePages, closedPages);

  const groupedActive = new Map<number, typeof activeSlice>();
  for (const t of activeSlice) {
    if (!groupedActive.has(t.assetId)) groupedActive.set(t.assetId, []);
    groupedActive.get(t.assetId)!.push(t);
  }

  const hasFilters = fLocationId || fPersonId || fAssetName || fTaskText || fDateFrom || fDateTo || fClosedFrom || fClosedTo;

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

  return (
    <div className="space-y-4">
      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      <div className="page-layout">
        {/* Sidebar filters */}
        <aside className="filter-panel">
          <div className="filter-panel-title">Фільтри</div>
          <AutoSubmitForm method="get" action="/tasks">
            <div className="space-y-3">
              <div className="field">
                <label className="field-label">Назва майна</label>
                <input name="asset_name" defaultValue={fAssetName} placeholder="Пошук..." className="input" />
              </div>
              <div className="field">
                <label className="field-label">Текст задачі</label>
                <input name="task_text" defaultValue={fTaskText} placeholder="Пошук..." className="input" />
              </div>
              <div className="field">
                <label className="field-label">Держатель</label>
                <select name="person_id" defaultValue={fPersonId?.toString() ?? ''} className="select">
                  <option value="">Усі</option>
                  {persons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Локація</label>
                <select name="location_id" defaultValue={fLocationId?.toString() ?? ''} className="select">
                  <option value="">Усі</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
                <p className="filter-panel-title" style={{ marginBottom: 'var(--space-2)' }}>Створено</p>
                <div className="space-y-2">
                  <div className="field">
                    <label className="field-label">З</label>
                    <input name="date_from" type="date" defaultValue={fDateFrom} className="input" />
                  </div>
                  <div className="field">
                    <label className="field-label">По</label>
                    <input name="date_to" type="date" defaultValue={fDateTo} className="input" />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
                <p className="filter-panel-title" style={{ marginBottom: 'var(--space-2)' }}>Закрито</p>
                <div className="space-y-2">
                  <div className="field">
                    <label className="field-label">З</label>
                    <input name="closed_from" type="date" defaultValue={fClosedFrom} className="input" />
                  </div>
                  <div className="field">
                    <label className="field-label">По</label>
                    <input name="closed_to" type="date" defaultValue={fClosedTo} className="input" />
                  </div>
                </div>
              </div>

              {hasFilters && (
                <Link href="/tasks" className="btn secondary sm" style={{ display: 'block', textAlign: 'center' }}>
                  Скинути фільтри
                </Link>
              )}
            </div>
          </AutoSubmitForm>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
            Активних: {active.length} · Закритих: {closed.length}
          </div>
        </aside>

        {/* Main content */}
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold">Задачі</h1>

          {/* Active tasks */}
          <div className="space-y-3">
            <h2 className="font-semibold">
              Активні задачі{' '}
              <span className="font-normal" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>
                ({active.length})
              </span>
            </h2>

            {activeSlice.length === 0 && (
              <div className="card text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-6)' }}>
                Активних задач немає
              </div>
            )}

            {Array.from(groupedActive.entries()).map(([assetId, tasks]) => {
              const a = assetMap.get(assetId);
              const holder = a?.currentHolderId ? personMap.get(a.currentHolderId) : null;
              const holderLoc = holder?.locationId ? locMap.get(holder.locationId) : null;
              return (
                <div key={assetId} className="table-wrap">
                  <div
                    className="flex items-center justify-between px-4 py-2"
                    style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}
                  >
                    <Link href={`/assets/${assetId}`} className="font-medium" style={{ color: 'var(--primary)' }}>
                      {a?.name ?? `#${assetId}`}
                    </Link>
                    {holder && (
                      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>
                        <Link href={`/people/${holder.id}`} className="hover:underline">{holder.name}</Link>
                        {holderLoc && <span> / {holderLoc.name}</span>}
                      </span>
                    )}
                  </div>
                  <ul style={{ borderTop: 0 }}>
                    {tasks.map(t => (
                      <li key={t.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-muted)' }}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1 flex-1 min-w-[12rem]">
                            <p style={{ fontSize: 'var(--fs-sm)' }}>{t.text}</p>
                            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                              Створено: {formatDateTime(t.createdAt)}
                            </p>
                          </div>
                          <form action={closeTask} className="flex flex-wrap gap-2 items-center">
                            <input type="hidden" name="task_id" value={t.id} />
                            <input type="hidden" name="asset_id" value={t.assetId} />
                            <input type="hidden" name="return_to" value="/tasks" />
                            <input name="close_comment" type="text" placeholder="Коментар" className="input" style={{ width: '9rem' }} />
                            <button type="submit" className="btn primary sm" style={{ whiteSpace: 'nowrap' }}>Закрити</button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Closed tasks */}
          <div className="space-y-3">
            <h2 className="font-semibold">
              Закриті задачі{' '}
              <span className="font-normal" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>
                ({closed.length})
              </span>
            </h2>

            {closedSlice.length === 0 && (
              <div className="card text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-6)' }}>
                Закритих задач немає
              </div>
            )}

            {closedSlice.length > 0 && (
              <div className="table-wrap overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Задача</th>
                      <th>Майно</th>
                      <th>Закрито</th>
                      <th>Коментар</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedSlice.map(t => {
                      const a = assetMap.get(t.assetId);
                      return (
                        <tr key={t.id} className="align-top">
                          <td style={{ color: 'var(--fg-muted)', textDecoration: 'line-through' }}>{t.text}</td>
                          <td>
                            <Link href={`/assets/${t.assetId}`} style={{ color: 'var(--primary)' }}>
                              {a?.name ?? `#${t.assetId}`}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                            {formatDate(t.closedAt)}
                          </td>
                          <td style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>{t.closeComment ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <a key={p} href={buildUrl({ page: p })} className={`page-btn${p === curPage ? ' active' : ''}`}>
                  {p}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

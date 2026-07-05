import Link from 'next/link';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { asset, location, person, task } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { holdersForAssets } from '@/lib/ledger';
import { formatDate } from '@/lib/time';
import { AddAssetModal } from '@/components/AddAssetModal';
import { AutoSubmitForm } from '@/components/AutoSubmitForm';
import { MultiSelectSearch } from '@/components/MultiSelectSearch';
import { SegmentedFilter } from '@/components/SegmentedFilter';
import { bulkTransferAssets } from '@/lib/asset-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SP = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function numArr(v: string | string[] | undefined): number[] {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list.map(x => parseInt(x)).filter(n => !Number.isNaN(n));
}

export default async function HomePage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const flash = await getFlash();

  const page = Math.max(1, parseInt(str(sp.page)) || 1);
  const fName = str(sp.name);
  const fSerial = str(sp.serial);
  const fType = str(sp.type);
  const fPersonIds = numArr(sp.person_id);
  const fLocationIds = numArr(sp.location_id);
  const sortBy = str(sp.sort) || 'created_at';
  const sortDir = str(sp.dir) || 'desc';

  const conds = [];
  if (fType === 'active' || fType === 'component') conds.push(eq(asset.type, fType));

  // SQLite's LIKE only case-folds ASCII, so it misses "ноутбук" vs "Ноутбук" —
  // name/serial matching happens in JS instead, where toLowerCase() handles Cyrillic correctly.
  let rawAssets = db
    .select()
    .from(asset)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .all();
  if (fName) {
    const needle = fName.toLowerCase();
    rawAssets = rawAssets.filter(a => a.name.toLowerCase().includes(needle));
  }
  if (fSerial) {
    const needle = fSerial.toLowerCase();
    rawAssets = rawAssets.filter(a => (a.serial ?? '').toLowerCase().includes(needle));
  }

  const allAssets = db.select({ type: asset.type }).from(asset).all();
  const persons = db.select().from(person).all();
  const locations = db.select().from(location).all();
  const nameSuggestions = Array.from(new Set(db.select({ name: asset.name }).from(asset).all().map(r => r.name))).sort(
    (a, b) => a.localeCompare(b, 'uk'),
  );
  const serialSuggestions = Array.from(
    new Set(
      db
        .select({ serial: asset.serial })
        .from(asset)
        .all()
        .map(r => r.serial)
        .filter((s): s is string => !!s),
    ),
  ).sort((a, b) => a.localeCompare(b, 'uk'));
  const personMap = new Map(persons.map(p => [p.id, p]));
  const locMap = new Map(locations.map(l => [l.id, l]));

  const taskCountRows = db
    .select({ assetId: task.assetId, cnt: count() })
    .from(task)
    .where(eq(task.status, 'active'))
    .groupBy(task.assetId)
    .all();
  const taskCountMap = new Map(taskCountRows.map(r => [r.assetId, r.cnt]));
  const totalActiveTasks = taskCountRows.reduce((sum, r) => sum + r.cnt, 0);

  const totalActives = allAssets.filter(a => a.type === 'active').length;
  const totalComponents = allAssets.filter(a => a.type === 'component').length;
  const totalPeople = persons.length;
  const totalLocations = locations.length;

  const compIds = rawAssets.filter(a => a.type === 'component').map(a => a.id);
  const ledger = holdersForAssets(compIds);

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

  let filtered = enriched;
  if (fPersonIds.length > 0) {
    filtered = filtered.filter(a => {
      if (a.type === 'active') return a.currentHolderId != null && fPersonIds.includes(a.currentHolderId);
      return a.compHolders.some(h => fPersonIds.includes(h.id));
    });
  }
  if (fLocationIds.length > 0) {
    filtered = filtered.filter(a => {
      if (a.type === 'active') return a.holderLocation != null && fLocationIds.includes(a.holderLocation.id);
      return a.compHolders.some(h => {
        const p = personMap.get(h.id);
        return p?.locationId != null && fLocationIds.includes(p.locationId);
      });
    });
  }

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

  const hasFilters = fName || fSerial || fType || fPersonIds.length > 0 || fLocationIds.length > 0;

  function buildUrl(overrides: Record<string, string | number | null | undefined>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v == null) continue;
      if (Array.isArray(v)) {
        for (const vv of v) p.append(k, vv);
      } else {
        p.set(k, v);
      }
    }
    p.set('sort', sortBy);
    p.set('dir', sortDir);
    p.set('page', String(curPage));
    for (const [k, v] of Object.entries(overrides)) {
      p.delete(k);
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

  function exportUrl() {
    const p = new URLSearchParams();
    if (fName) p.set('name', fName);
    if (fSerial) p.set('serial', fSerial);
    if (fType) p.set('type', fType);
    for (const id of fPersonIds) p.append('person_id', String(id));
    for (const id of fLocationIds) p.append('location_id', String(id));
    const qs = p.toString();
    return qs ? `/assets/export?${qs}` : '/assets/export';
  }

  return (
    <div className="space-y-4">
      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Облік майна</h1>
        <div className="flex items-center gap-2">
          <a href={exportUrl()} className="btn secondary sm">Експорт CSV</a>
          <AddAssetModal />
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card-value">{totalActives}</span>
          <span className="stat-card-label">Активів</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{totalComponents}</span>
          <span className="stat-card-label">Компонентів</span>
        </div>
        <Link href="/people" className="stat-card" style={{ textDecoration: 'none' }}>
          <span className="stat-card-value">{totalPeople}</span>
          <span className="stat-card-label">Людей →</span>
        </Link>
        <Link href="/locations" className="stat-card" style={{ textDecoration: 'none' }}>
          <span className="stat-card-value">{totalLocations}</span>
          <span className="stat-card-label">Локацій →</span>
        </Link>
        {totalActiveTasks > 0 && (
          <Link
            href="/tasks"
            className="stat-card"
            style={{
              textDecoration: 'none',
              borderColor: 'color-mix(in oklch, var(--warning) 40%, transparent)',
            }}
          >
            <span className="stat-card-value" style={{ color: 'var(--warning)' }}>
              {totalActiveTasks}
            </span>
            <span className="stat-card-label" style={{ color: 'var(--warning-soft-fg)' }}>
              Задач →
            </span>
          </Link>
        )}
      </div>

      {/* Two-column layout: sidebar + table */}
      <div className="page-layout">
        {/* Filter sidebar */}
        <aside className="filter-panel">
          <div className="filter-panel-title">Фільтри</div>
          <AutoSubmitForm method="get">
            <div className="space-y-3">
              <div className="field">
                <label className="field-label">Назва</label>
                <input
                  name="name"
                  defaultValue={fName}
                  placeholder="Пошук..."
                  className="input"
                  list="name-suggestions"
                  autoComplete="off"
                />
                <datalist id="name-suggestions">
                  {nameSuggestions.map(n => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label className="field-label">Серійний номер</label>
                <input
                  name="serial"
                  defaultValue={fSerial}
                  placeholder="SN..."
                  className="input"
                  list="serial-suggestions"
                  autoComplete="off"
                />
                <datalist id="serial-suggestions">
                  {serialSuggestions.map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label className="field-label">Тип</label>
                <SegmentedFilter
                  name="type"
                  defaultValue={fType}
                  options={[
                    { value: '', label: 'Усі' },
                    { value: 'active', label: 'Актив' },
                    { value: 'component', label: 'Компонент' },
                  ]}
                />
              </div>
              <div className="field">
                <label className="field-label">Особа</label>
                <MultiSelectSearch
                  name="person_id"
                  placeholder="Пошук особи..."
                  defaultSelectedIds={fPersonIds}
                  options={persons.map(p => ({ id: p.id, label: p.name }))}
                />
              </div>
              <div className="field">
                <label className="field-label">Локація</label>
                <MultiSelectSearch
                  name="location_id"
                  placeholder="Пошук локації..."
                  defaultSelectedIds={fLocationIds}
                  options={locations.map(l => ({ id: l.id, label: l.name }))}
                />
              </div>
              <input type="hidden" name="sort" value={sortBy} />
              <input type="hidden" name="dir" value={sortDir} />
              {hasFilters && (
                // Hard navigation on purpose: clears uncontrolled input values and
                // client-side filter component state (MultiSelectSearch, SegmentedFilter),
                // which a soft Link transition would leave stale.
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a href="/" className="btn secondary sm" style={{ display: 'block', textAlign: 'center' }}>
                  Скинути фільтри
                </a>
              )}
            </div>
          </AutoSubmitForm>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)', marginTop: 'var(--space-1)' }}>
            Знайдено: {total}
          </p>
        </aside>

        {/* Table */}
        <div className="space-y-3">
          <div
            className="space-y-2"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-elevated)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            <div className="filter-panel-title">
              Масові дії <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(позначте активи галочками в таблиці)</span>
            </div>
            <form
              id="bulk-assets-form"
              action={bulkTransferAssets}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="return_to" value={buildUrl({})} />
              <select name="person_id" defaultValue="" className="select" required style={{ maxWidth: '14rem' }}>
                <option value="" disabled>Кому передати...</option>
                {persons.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input name="comment" placeholder="Коментар" className="input" style={{ maxWidth: '12rem' }} />
              <button type="submit" className="btn primary sm">Перемістити обрані активи</button>
            </form>
          </div>

          <div className="table-wrap overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '2rem' }}></th>
                  <th>
                    <a href={sortLink('name')}>
                      Назва{arrow('name')}
                    </a>
                  </th>
                  <th>Серійний номер</th>
                  <th>Тип</th>
                  <th>
                    <a href={sortLink('location')}>
                      Держатель / Локація{arrow('location')}
                    </a>
                  </th>
                  <th>
                    <a href={sortLink('task_count')}>
                      Задачі{arrow('task_count')}
                    </a>
                  </th>
                  <th>
                    <a href={sortLink('created_at')}>
                      Дата{arrow('created_at')}
                    </a>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slice.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center"
                      style={{ color: 'var(--fg-subtle)', padding: 'var(--space-8)' }}
                    >
                      Нічого не знайдено
                    </td>
                  </tr>
                )}
                {slice.map(a => (
                  <tr key={a.id}>
                    <td>
                      {a.type === 'active' && (
                        <input type="checkbox" name="asset_ids" value={a.id} form="bulk-assets-form" />
                      )}
                    </td>
                    <td>
                      <Link href={`/assets/${a.id}`} className="font-medium" style={{ color: 'var(--primary)' }}>
                        {a.name}
                      </Link>
                      {a.comments && (
                        <span
                          className="block truncate max-w-xs"
                          style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}
                        >
                          {a.comments}
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-xs)' }}>{a.serial ?? '—'}</td>
                    <td>
                      <span className={`badge ${a.type === 'active' ? 'primary' : 'info'}`}>
                        {a.type === 'active' ? 'Актив' : 'Компонент'}
                      </span>
                    </td>
                    <td>
                      {a.type === 'active' ? (
                        a.holderPerson ? (
                          <span>
                            <Link href={`/people/${a.holderPerson.id}`} style={{ color: 'var(--primary)' }}>
                              {a.holderPerson.name}
                            </Link>
                            {a.holderLocation && (
                              <span style={{ color: 'var(--fg-subtle)' }}> / {a.holderLocation.name}</span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--fg-disabled)' }}>На складі</span>
                        )
                      ) : a.compHolders.length > 0 ? (
                        <div className="space-y-0.5">
                          {(a.quantity ?? 0) > 0 && (
                            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-disabled)' }}>
                              Склад: {a.quantity}
                            </div>
                          )}
                          {a.compHolders.map(h => (
                            <div key={h.id}>
                              <Link href={`/people/${h.id}`} style={{ color: 'var(--primary)' }}>
                                {h.name}
                              </Link>
                              <span style={{ color: 'var(--fg-subtle)' }}> ×{h.qty}</span>
                              {h.locName && (
                                <span style={{ color: 'var(--fg-disabled)' }}> / {h.locName}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--fg-disabled)' }}>На складі ({a.quantity ?? 0})</span>
                      )}
                    </td>
                    <td>
                      {a.taskCount > 0 ? (
                        <span className="badge warning">{a.taskCount}</span>
                      ) : (
                        <span style={{ color: 'var(--fg-disabled)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--fg-subtle)', fontSize: 'var(--fs-xs)' }}>
                      {formatDate(a.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

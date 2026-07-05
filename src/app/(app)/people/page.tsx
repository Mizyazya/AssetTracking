import Link from 'next/link';
import { and, count, eq, isNotNull, like } from 'drizzle-orm';
import { db } from '@/db';
import { person, location, asset } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { holdersForAssets } from '@/lib/ledger';
import { addPerson, deletePerson } from '@/lib/people-actions';
import { AutoSubmitForm } from '@/components/AutoSubmitForm';
import { Modal } from '@/components/Modal';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;
function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function PeoplePage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const flash = await getFlash();

  const page = Math.max(1, parseInt(str(sp.page)) || 1);
  const fName = str(sp.name);
  const fLocationId = str(sp.location_id);
  const fHasAssets = str(sp.has_assets);

  const locations = db.select().from(location).orderBy(location.name).all();

  const conds = [];
  if (fName) conds.push(like(person.name, `%${fName}%`));
  const persons = db
    .select()
    .from(person)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(person.name)
    .all();

  const activeCountRows = db
    .select({ personId: asset.currentHolderId, cnt: count() })
    .from(asset)
    .where(and(eq(asset.type, 'active'), isNotNull(asset.currentHolderId)))
    .groupBy(asset.currentHolderId)
    .all();
  const activeCountMap = new Map(activeCountRows.map(r => [r.personId as number, r.cnt]));

  const compIds = db.select({ id: asset.id }).from(asset).where(eq(asset.type, 'component')).all().map(r => r.id);
  const compLedger = holdersForAssets(compIds);
  const compCountMap = new Map<number, number>();
  for (const holders of compLedger.values()) {
    for (const [pid, qty] of holders) {
      compCountMap.set(pid, (compCountMap.get(pid) ?? 0) + qty);
    }
  }

  let rows = persons.map(p => ({
    id: p.id,
    name: p.name,
    locationId: p.locationId ?? null,
    phone: p.phone ?? null,
    activeCount: activeCountMap.get(p.id) ?? 0,
    compCount: compCountMap.get(p.id) ?? 0,
  }));

  if (fLocationId === 'none') rows = rows.filter(p => p.locationId === null);
  else if (fLocationId) rows = rows.filter(p => p.locationId === parseInt(fLocationId));
  if (fHasAssets === 'yes') rows = rows.filter(p => p.activeCount > 0);
  else if (fHasAssets === 'no') rows = rows.filter(p => p.activeCount === 0);

  const locMap = new Map(locations.map(l => [l.id, l.name]));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const slice = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const hasFilters = fName || fLocationId || fHasAssets;

  function buildUrl(overrides: Record<string, string | number | null | undefined>) {
    const base: Record<string, string> = {};
    if (fName) base.name = fName;
    if (fLocationId) base.location_id = fLocationId;
    if (fHasAssets) base.has_assets = fHasAssets;
    base.page = String(curPage);
    const merged = { ...base, ...overrides };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '') p.set(k, String(v));
    }
    const qs = p.toString();
    return qs ? `/people?${qs}` : '/people';
  }

  return (
    <div className="space-y-4">
      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      <h1 className="text-2xl font-semibold">Люди</h1>

      <div className="page-layout">
        {/* Filter sidebar */}
        <aside className="filter-panel">
          <div className="filter-panel-title">Фільтри</div>
          <AutoSubmitForm method="get" action="/people">
            <div className="space-y-3">
              <div className="field">
                <label className="field-label">Пошук</label>
                <input name="name" defaultValue={fName} placeholder="Ім'я..." className="input" />
              </div>
              <div className="field">
                <label className="field-label">Локація</label>
                <select name="location_id" defaultValue={fLocationId} className="select">
                  <option value="">Усі</option>
                  <option value="none">Без локації</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Майно</label>
                <select name="has_assets" defaultValue={fHasAssets} className="select">
                  <option value="">Усі</option>
                  <option value="yes">Є майно</option>
                  <option value="no">Немає майна</option>
                </select>
              </div>
              {hasFilters && (
                <Link href="/people" className="btn secondary sm" style={{ display: 'block', textAlign: 'center' }}>
                  Скинути фільтри
                </Link>
              )}
            </div>
          </AutoSubmitForm>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
            <Modal triggerLabel="+ Додати особу" triggerClassName="btn primary sm" title="Нова особа">
              <form action={addPerson} className="space-y-4">
                <div className="field">
                  <label className="field-label">
                    Ім&apos;я <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input name="name" type="text" required className="input" placeholder="Іван Франко" autoFocus />
                </div>
                <div className="field">
                  <label className="field-label">Телефон</label>
                  <input name="phone" type="text" className="input" placeholder="+380..." />
                </div>
                <div className="field">
                  <label className="field-label">Локація</label>
                  <select name="location_id" className="select">
                    <option value="">Без локації</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn primary block">
                  Додати особу
                </button>
              </form>
            </Modal>
          </div>

          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>Знайдено: {total}</p>
        </aside>

        {/* Table */}
        <div className="space-y-3">
          <div className="table-wrap overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Ім&apos;я</th>
                  <th>Локація</th>
                  <th>Телефон</th>
                  <th style={{ width: '5rem', textAlign: 'right' }}>Активів</th>
                  <th style={{ width: '6rem', textAlign: 'right' }}>Компоненти</th>
                  <th style={{ width: '5rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-8)' }}>
                      Нікого не знайдено
                    </td>
                  </tr>
                )}
                {slice.map(p => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/people/${p.id}`} className="font-medium" style={{ color: 'var(--primary)' }}>
                        {p.name}
                      </Link>
                    </td>
                    <td style={{ color: 'var(--fg-muted)' }}>{p.locationId ? (locMap.get(p.locationId) ?? '—') : '—'}</td>
                    <td style={{ color: 'var(--fg-muted)' }}>{p.phone ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {p.activeCount > 0 ? (
                        <span className="badge primary">{p.activeCount}</span>
                      ) : (
                        <span style={{ color: 'var(--fg-disabled)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {p.compCount > 0 ? (
                        <span className="badge info">{p.compCount}</span>
                      ) : (
                        <span style={{ color: 'var(--fg-disabled)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <form action={deletePerson} className="inline">
                        <input type="hidden" name="person_id" value={p.id} />
                        <button type="submit" className="btn link danger sm">
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
            <div className="pagination">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                <a key={pg} href={buildUrl({ page: pg })} className={`page-btn${pg === curPage ? ' active' : ''}`}>
                  {pg}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

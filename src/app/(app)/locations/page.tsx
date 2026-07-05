import Link from 'next/link';
import { like } from 'drizzle-orm';
import { db } from '@/db';
import { location, person } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { addLocation, deleteLocation } from '@/lib/people-actions';
import { AutoSubmitForm } from '@/components/AutoSubmitForm';
import { Modal } from '@/components/Modal';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;
function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function LocationsPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const flash = await getFlash();

  const page = Math.max(1, parseInt(str(sp.page)) || 1);
  const fName = str(sp.name);

  const locations = db
    .select()
    .from(location)
    .where(fName ? like(location.name, `%${fName}%`) : undefined)
    .orderBy(location.name)
    .all();

  const persons = db.select({ locationId: person.locationId }).from(person).all();
  const countMap = new Map<number, number>();
  for (const p of persons) {
    if (p.locationId) countMap.set(p.locationId, (countMap.get(p.locationId) ?? 0) + 1);
  }

  const rows = locations.map(l => ({
    id: l.id,
    name: l.name,
    personCount: countMap.get(l.id) ?? 0,
  }));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const slice = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const hasFilters = !!fName;

  function buildUrl(overrides: Record<string, string | number | null | undefined>) {
    const base: Record<string, string> = {};
    if (fName) base.name = fName;
    base.page = String(curPage);
    const merged = { ...base, ...overrides };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '') p.set(k, String(v));
    }
    const qs = p.toString();
    return qs ? `/locations?${qs}` : '/locations';
  }

  return (
    <div className="space-y-4">
      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      <h1 className="text-2xl font-semibold">Локації</h1>

      <div className="page-layout">
        {/* Filter sidebar */}
        <aside className="filter-panel">
          <div className="filter-panel-title">Фільтри</div>
          <AutoSubmitForm method="get" action="/locations">
            <div className="space-y-3">
              <div className="field">
                <label className="field-label">Пошук</label>
                <input name="name" defaultValue={fName} placeholder="Назва..." className="input" />
              </div>
              {hasFilters && (
                // Hard navigation on purpose: clears uncontrolled input values a soft Link transition would leave stale.
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a href="/locations" className="btn secondary sm" style={{ display: 'block', textAlign: 'center' }}>
                  Скинути фільтри
                </a>
              )}
            </div>
          </AutoSubmitForm>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
            <Modal triggerLabel="+ Додати локацію" triggerClassName="btn primary sm" title="Нова локація">
              <form action={addLocation} className="space-y-4">
                <div className="field">
                  <label className="field-label">
                    Назва <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input name="name" type="text" required className="input" placeholder="Склад, Офіс 3..." autoFocus />
                </div>
                <button type="submit" className="btn primary block">
                  Додати локацію
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
                  <th>Назва</th>
                  <th style={{ width: '6rem', textAlign: 'right' }}>Людей</th>
                  <th style={{ width: '5rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-8)' }}>
                      Нічого не знайдено
                    </td>
                  </tr>
                )}
                {slice.map(l => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/locations/${l.id}`} className="font-medium" style={{ color: 'var(--primary)' }}>
                        {l.name}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.personCount > 0 ? (
                        <span className="badge primary">{l.personCount}</span>
                      ) : (
                        <span style={{ color: 'var(--fg-disabled)' }}>0</span>
                      )}
                    </td>
                    <td>
                      <form action={deleteLocation} className="inline">
                        <input type="hidden" name="location_id" value={l.id} />
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

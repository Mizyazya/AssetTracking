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

  const persons = db.select().from(person).where(eq(person.locationId, locationId)).orderBy(person.name).all();
  const personIds = persons.map(p => p.id);

  const activeAssets = db.select().from(asset).where(eq(asset.type, 'active')).all()
    .filter(a => a.currentHolderId != null && personIds.includes(a.currentHolderId));

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

  // Build aggregated component totals across all people at this location
  type CompTotal = {
    assetId: number;
    assetName: string;
    total: number;
    byPerson: { personId: number; personName: string; qty: number }[];
  };
  const compTotals = new Map<number, CompTotal>();
  for (const p of persons) {
    const comps = personComponents.get(p.id) ?? [];
    for (const { asset: c, qty } of comps) {
      if (!compTotals.has(c.id)) {
        compTotals.set(c.id, { assetId: c.id, assetName: c.name, total: 0, byPerson: [] });
      }
      const entry = compTotals.get(c.id)!;
      entry.total += qty;
      entry.byPerson.push({ personId: p.id, personName: p.name, qty });
    }
  }
  const sortedCompTotals = Array.from(compTotals.values()).sort((a, b) =>
    a.assetName.localeCompare(b.assetName, 'uk'),
  );

  return (
    <div className="space-y-6">
      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/locations" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>← Локації</Link>
          <h1 className="mt-1 text-2xl font-semibold">{loc.name}</h1>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>{persons.length} людей</p>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <form action={editLocation} className="flex flex-wrap gap-2">
            <input type="hidden" name="location_id" value={loc.id} />
            <input name="name" type="text" required defaultValue={loc.name} className="input" style={{ width: '14rem', maxWidth: '100%' }} />
            <button type="submit" className="btn secondary sm">Зберегти</button>
          </form>
          <form action={deleteLocation}>
            <input type="hidden" name="location_id" value={loc.id} />
            <button type="submit" className="btn danger outline sm">Видалити</button>
          </form>
        </div>
      </div>

      {/* Component totals summary */}
      {sortedCompTotals.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-medium">Компоненти на локації</h2>
          <div className="table-wrap overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Компонент</th>
                  <th style={{ width: '6rem' }}>Загалом</th>
                  <th>Розподіл</th>
                </tr>
              </thead>
              <tbody>
                {sortedCompTotals.map(ct => (
                  <tr key={ct.assetId}>
                    <td>
                      <Link href={`/assets/${ct.assetId}`} style={{ color: 'var(--primary)' }}>
                        {ct.assetName}
                      </Link>
                    </td>
                    <td className="font-semibold">{ct.total}</td>
                    <td style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>
                      {ct.byPerson.map(bp => (
                        <span key={bp.personId} className="mr-3 whitespace-nowrap">
                          <Link href={`/people/${bp.personId}`} style={{ color: 'var(--fg)' }}>
                            {bp.personName}
                          </Link>
                          {' '}({bp.qty})
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* People table */}
      <section className="card space-y-3">
        <h2 className="font-medium">Люди</h2>
        {persons.length === 0 ? (
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>Немає людей на цій локації</p>
        ) : (
          <div className="table-wrap overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Особа</th>
                  <th>Активи</th>
                  <th>Компоненти</th>
                </tr>
              </thead>
              <tbody>
                {persons.map(p => {
                  const myAssets = activeAssets.filter(a => a.currentHolderId === p.id);
                  const myComponents = personComponents.get(p.id) ?? [];
                  return (
                    <tr key={p.id} className="align-top">
                      <td>
                        <Link href={`/people/${p.id}`} className="font-medium" style={{ color: 'var(--primary)' }}>
                          {p.name}
                        </Link>
                        {p.phone && (
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>{p.phone}</div>
                        )}
                      </td>
                      <td>
                        {myAssets.length === 0 ? (
                          <span style={{ color: 'var(--fg-disabled)', fontSize: 'var(--fs-sm)' }}>—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {myAssets.map(a => (
                              <li key={a.id} style={{ fontSize: 'var(--fs-sm)' }}>
                                <Link href={`/assets/${a.id}`} style={{ color: 'var(--primary)' }}>{a.name}</Link>
                                {a.serial && (
                                  <span style={{ color: 'var(--fg-subtle)' }}> ({a.serial})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        {myComponents.length === 0 ? (
                          <span style={{ color: 'var(--fg-disabled)', fontSize: 'var(--fs-sm)' }}>—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {myComponents.map(c => (
                              <li key={c.asset.id} style={{ fontSize: 'var(--fs-sm)' }}>
                                <Link href={`/assets/${c.asset.id}`} style={{ color: 'var(--primary)' }}>
                                  {c.asset.name}
                                </Link>
                                <span style={{ color: 'var(--fg-subtle)' }}> ×{c.qty}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

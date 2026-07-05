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

  const activeAssets = db.select().from(asset).where(eq(asset.currentHolderId, personId)).all();

  const components = db.select().from(asset).where(eq(asset.type, 'component')).all()
    .map(a => ({ ...a, balance: componentHolders(a.id).get(personId) ?? 0 }))
    .filter(a => a.balance > 0);

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

  const allAssets = db.select({ id: asset.id, name: asset.name }).from(asset).all();
  const assetMap = new Map(allAssets.map(a => [a.id, a.name]));

  return (
    <div className="space-y-6">
      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/people" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>← Люди</Link>
          <h1 className="mt-1 text-2xl font-semibold">{p.name}</h1>
          {p.phone && <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>{p.phone}</p>}
          {p.locationId && (
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>
              Локація:{' '}
              <Link href={`/locations/${p.locationId}`} style={{ color: 'var(--primary)' }}>
                {locMap.get(p.locationId)?.name}
              </Link>
            </p>
          )}
        </div>
        <form action={deletePerson}>
          <input type="hidden" name="person_id" value={p.id} />
          <button type="submit" className="btn danger outline">Видалити</button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <section className="card space-y-3">
            <h2 className="font-medium">Редагувати</h2>
            <form action={editPerson} className="space-y-3">
              <input type="hidden" name="person_id" value={p.id} />
              <div className="field">
                <label className="field-label">Ім&apos;я</label>
                <input name="name" type="text" required defaultValue={p.name} className="input" />
              </div>
              <div className="field">
                <label className="field-label">Телефон</label>
                <input name="phone" type="text" defaultValue={p.phone ?? ''} className="input" />
              </div>
              <div className="field">
                <label className="field-label">Локація</label>
                <select name="location_id" defaultValue={p.locationId?.toString() ?? ''} className="select">
                  <option value="">Без локації</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <button type="submit" className="btn secondary sm">Зберегти</button>
            </form>
          </section>

          <section className="card space-y-2">
            <h2 className="font-medium">Активи ({activeAssets.length})</h2>
            {activeAssets.length === 0 ? (
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>Немає активів</p>
            ) : (
              <ul className="space-y-1">
                {activeAssets.map(a => (
                  <li key={a.id} style={{ fontSize: 'var(--fs-sm)' }}>
                    <Link href={`/assets/${a.id}`} style={{ color: 'var(--primary)' }}>{a.name}</Link>
                    {a.serial && <span style={{ color: 'var(--fg-subtle)' }}> ({a.serial})</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {components.length > 0 && (
            <section className="card space-y-2">
              <h2 className="font-medium">Компоненти</h2>
              <div className="table-wrap overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Компонент</th>
                      <th>Кількість</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map(c => (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/assets/${c.id}`} style={{ color: 'var(--primary)' }}>{c.name}</Link>
                        </td>
                        <td className="font-medium">{c.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <section className="card space-y-3">
          <h2 className="font-medium">
            Історія{' '}
            <span className="font-normal" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>
              ({histTotal})
            </span>
          </h2>
          <div className="table-wrap overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Дія</th>
                  <th>Майно</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {histSlice.map(log => (
                  <tr key={log.id} className="align-top">
                    <td>
                      <span className="font-medium">{log.action}</span>
                      {log.quantity != null && (
                        <span className="ml-1" style={{ color: 'var(--fg-subtle)' }}>×{log.quantity}</span>
                      )}
                    </td>
                    <td>
                      <Link href={`/assets/${log.assetId}`} style={{ color: 'var(--primary)', fontSize: 'var(--fs-xs)' }}>
                        {assetMap.get(log.assetId) ?? `#${log.assetId}`}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                      {formatDateTime(log.timestamp)}
                    </td>
                  </tr>
                ))}
                {histSlice.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-6)' }}>
                      Немає записів
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {histPages > 1 && (
            <div className="pagination">
              {Array.from({ length: histPages }, (_, i) => i + 1).map(pg => (
                <a key={pg} href={`/people/${personId}?hpage=${pg}`}
                   className={`page-btn${pg === curHPage ? ' active' : ''}`}>
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

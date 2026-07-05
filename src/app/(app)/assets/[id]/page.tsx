import { notFound } from 'next/navigation';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { asset, assetLog, person, location, task } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { componentHolders } from '@/lib/ledger';
import { formatDateTime, formatDate } from '@/lib/time';
import {
  assignAsset,
  returnAsset,
  addTask,
  closeTask,
  editAsset,
} from '@/lib/asset-actions';
import { ComponentActions } from '@/components/ComponentActions';
import { PersonSearch } from '@/components/PersonSearch';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function AssetDetailPage({
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

  const assetId = parseInt(id);
  if (isNaN(assetId)) notFound();

  const a = db.select().from(asset).where(eq(asset.id, assetId)).get();
  if (!a) notFound();

  const hPage = Math.max(1, parseInt(str(sp.hpage)) || 1);
  const allLogs = db
    .select({
      id: assetLog.id,
      action: assetLog.action,
      comment: assetLog.comment,
      timestamp: assetLog.timestamp,
      personId: assetLog.personId,
      quantity: assetLog.quantity,
    })
    .from(assetLog)
    .where(eq(assetLog.assetId, assetId))
    .orderBy(desc(assetLog.timestamp))
    .all();

  const histTotal = allLogs.length;
  const histPages = Math.max(1, Math.ceil(histTotal / PAGE_SIZE));
  const curHPage = Math.min(hPage, histPages);
  const histSlice = allLogs.slice((curHPage - 1) * PAGE_SIZE, curHPage * PAGE_SIZE);

  const persons = db.select().from(person).all();
  const personMap = new Map(persons.map(p => [p.id, p]));
  const locations = db.select().from(location).all();
  const locMap = new Map(locations.map(l => [l.id, l]));

  const holders =
    a.type === 'component'
      ? Array.from(componentHolders(assetId).entries())
          .map(([pid, qty]) => ({ person: personMap.get(pid), qty }))
          .filter((h): h is { person: NonNullable<typeof h.person>; qty: number } => h.person != null)
      : [];

  const activeTasks =
    a.type === 'active'
      ? db.select().from(task).where(eq(task.assetId, assetId)).all().filter(t => t.status === 'active')
      : [];
  const closedTasks =
    a.type === 'active'
      ? db.select().from(task).where(eq(task.assetId, assetId)).orderBy(desc(task.closedAt)).all()
          .filter(t => t.status === 'closed').slice(0, 5)
      : [];

  const currentHolder = a.currentHolderId ? personMap.get(a.currentHolderId) : null;
  const holderLocation = currentHolder?.locationId ? locMap.get(currentHolder.locationId) : null;

  const allPersonOptions = persons.map(p => ({
    id: p.id,
    name: p.name,
    extra: p.locationId ? locMap.get(p.locationId)?.name : undefined,
  }));

  const holderOptions = holders.map(h => ({
    id: h.person.id,
    name: h.person.name,
    extra: `є: ${h.qty}`,
  }));

  const sectionCls = 'card space-y-3';

  return (
    <div className="space-y-6">
      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>← Список</Link>
            <span className={`badge ${a.type === 'active' ? 'primary' : 'info'}`}>
              {a.type === 'active' ? 'Актив' : 'Компонент'}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{a.name}</h1>
          {a.serial && <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>S/N: {a.serial}</p>}
          {a.comments && <p className="mt-1" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>{a.comments}</p>}
        </div>
        <div className="text-right" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>
          <div>Додано: {formatDate(a.createdAt)}</div>
          {a.type === 'active' && (
            <div>
              Статус:{' '}
              <span style={{ color: a.status === 'На складі' ? 'var(--success)' : 'var(--warning)' }}>
                {a.status}
              </span>
            </div>
          )}
          {a.type === 'component' && <div>На складі: {a.quantity ?? 0} шт.</div>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-4 min-w-0">
          {a.type === 'active' && (
            <>
              <section className={sectionCls}>
                <h2 className="font-medium">Держатель</h2>
                {currentHolder ? (
                  <div style={{ fontSize: 'var(--fs-sm)' }}>
                    <Link href={`/people/${currentHolder.id}`} className="font-medium" style={{ color: 'var(--primary)' }}>
                      {currentHolder.name}
                    </Link>
                    {holderLocation && <span style={{ color: 'var(--fg-subtle)' }}> / {holderLocation.name}</span>}
                    {currentHolder.phone && <div style={{ color: 'var(--fg-subtle)' }}>{currentHolder.phone}</div>}
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>На складі</p>
                )}
                {currentHolder && (
                  <form action={returnAsset}>
                    <input type="hidden" name="asset_id" value={a.id} />
                    <button type="submit" className="btn secondary sm">Повернути на склад</button>
                  </form>
                )}
              </section>

              <section className={sectionCls}>
                <h2 className="font-medium">{currentHolder ? 'Передати іншому' : 'Видати'}</h2>
                <form action={assignAsset} className="space-y-3">
                  <input type="hidden" name="asset_id" value={a.id} />
                  <div className="field">
                    <label className="field-label">Отримувач</label>
                    <PersonSearch
                      persons={allPersonOptions.filter(p => p.id !== a.currentHolderId)}
                      name="person_id"
                      required
                      placeholder="Пошук особи..."
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Коментар</label>
                    <input name="comment" type="text" placeholder="Необов'язково" className="input" />
                  </div>
                  <button type="submit" className="btn primary sm">
                    {currentHolder ? 'Передати' : 'Видати'}
                  </button>
                </form>
              </section>

              <section className={sectionCls}>
                <h2 className="font-medium">Задачі</h2>
                <form action={addTask} className="flex flex-wrap gap-2">
                  <input type="hidden" name="asset_id" value={a.id} />
                  <input name="text" type="text" placeholder="Нова задача…" required className="input" />
                  <button type="submit" className="btn primary sm" style={{ flexShrink: 0 }}>Додати</button>
                </form>

                {activeTasks.length > 0 && (
                  <ul className="space-y-2">
                    {activeTasks.map(t => (
                      <li key={t.id} className="rounded-lg border p-3 space-y-2"
                          style={{ background: 'var(--warning-soft)', borderColor: 'color-mix(in oklch, var(--warning) 30%, transparent)' }}>
                        <p className="font-medium" style={{ fontSize: 'var(--fs-sm)' }}>{t.text}</p>
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{formatDateTime(t.createdAt)}</p>
                        <form action={closeTask} className="flex flex-wrap gap-2">
                          <input type="hidden" name="task_id" value={t.id} />
                          <input type="hidden" name="asset_id" value={a.id} />
                          <input name="close_comment" type="text" placeholder="Коментар до закриття" className="input" />
                          <button type="submit" className="btn primary sm" style={{ flexShrink: 0 }}>Закрити</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                {activeTasks.length === 0 && (
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)' }}>Активних задач немає</p>
                )}

                {closedTasks.length > 0 && (
                  <details style={{ fontSize: 'var(--fs-sm)' }}>
                    <summary style={{ color: 'var(--fg-subtle)', cursor: 'pointer' }}>
                      Закриті задачі ({closedTasks.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {closedTasks.map(t => (
                        <li key={t.id} style={{ color: 'var(--fg-subtle)', textDecoration: 'line-through' }}>
                          {t.text}
                          <span style={{ textDecoration: 'none' }} className="ml-2">— {formatDate(t.closedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            </>
          )}

          {a.type === 'component' && (
            <>
              {holders.length > 0 && (
                <section className={sectionCls}>
                  <h2 className="font-medium">Держателі</h2>
                  <div className="table-wrap overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Особа</th>
                          <th>Локація</th>
                          <th>Кількість</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holders.map(h => {
                          const loc = h.person.locationId ? locMap.get(h.person.locationId) : null;
                          return (
                            <tr key={h.person.id}>
                              <td>
                                <Link href={`/people/${h.person.id}`} style={{ color: 'var(--primary)' }}>
                                  {h.person.name}
                                </Link>
                              </td>
                              <td style={{ color: 'var(--fg-subtle)' }}>{loc?.name ?? '—'}</td>
                              <td className="font-medium">{h.qty}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <ComponentActions
                assetId={a.id}
                stockQty={a.quantity ?? 0}
                allPersons={allPersonOptions}
                holders={holderOptions}
              />
            </>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4 min-w-0">
          <section className={sectionCls}>
            <h2 className="font-medium">Редагувати</h2>
            <form action={editAsset} className="space-y-3">
              <input type="hidden" name="asset_id" value={a.id} />
              <div className="field">
                <label className="field-label">Назва</label>
                <input name="name" type="text" required defaultValue={a.name} className="input" />
              </div>
              <div className="field">
                <label className="field-label">Серійний номер</label>
                <input name="serial" type="text" defaultValue={a.serial ?? ''} className="input" />
              </div>
              <div className="field">
                <label className="field-label">Коментар</label>
                <textarea name="comments" rows={2} defaultValue={a.comments ?? ''} className="input" />
              </div>
              <button type="submit" className="btn secondary sm">Зберегти</button>
            </form>
          </section>

          <section className={sectionCls}>
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
                    <th>Дата</th>
                    <th>Коментар</th>
                  </tr>
                </thead>
                <tbody>
                  {histSlice.map(log => {
                    const p = log.personId ? personMap.get(log.personId) : null;
                    return (
                      <tr key={log.id} className="align-top">
                        <td>
                          <span className="font-medium">{log.action}</span>
                          {log.quantity != null && (
                            <span className="ml-1" style={{ color: 'var(--fg-subtle)' }}>×{log.quantity}</span>
                          )}
                          {p && (
                            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                              <Link href={`/people/${p.id}`} className="hover:underline">{p.name}</Link>
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                          {formatDateTime(log.timestamp)}
                        </td>
                        <td style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{log.comment}</td>
                      </tr>
                    );
                  })}
                  {histSlice.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-6)' }}>
                        Журнал порожній
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {histPages > 1 && (
              <div className="pagination">
                {Array.from({ length: histPages }, (_, i) => i + 1).map(p => (
                  <a key={p} href={`/assets/${assetId}?hpage=${p}`}
                     className={`page-btn${p === curHPage ? ' active' : ''}`}>
                    {p}
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

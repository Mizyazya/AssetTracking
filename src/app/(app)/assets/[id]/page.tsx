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
  addSupply,
  addTask,
  closeTask,
  editAsset,
} from '@/lib/asset-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

const inputCls =
  'block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
const labelCls = 'block text-sm font-medium text-gray-700';
const btnPrimary = 'rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700';
const btnSecondary =
  'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50';

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

  // History pagination
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

  // Reference data
  const persons = db.select().from(person).all();
  const personMap = new Map(persons.map(p => [p.id, p]));
  const locations = db.select().from(location).all();
  const locMap = new Map(locations.map(l => [l.id, l]));

  // Component holders from ledger
  const holders =
    a.type === 'component'
      ? Array.from(componentHolders(assetId).entries())
          .map(([pid, qty]) => ({ person: personMap.get(pid), qty }))
          .filter((h): h is { person: NonNullable<typeof h.person>; qty: number } => h.person != null)
      : [];

  // Active & closed tasks (only for active-type assets)
  const activeTasks =
    a.type === 'active'
      ? db.select().from(task).where(eq(task.assetId, assetId)).all().filter(t => t.status === 'active')
      : [];
  const closedTasks =
    a.type === 'active'
      ? db
          .select()
          .from(task)
          .where(eq(task.assetId, assetId))
          .orderBy(desc(task.closedAt))
          .all()
          .filter(t => t.status === 'closed')
          .slice(0, 5)
      : [];

  // Current holder info (for active assets)
  const currentHolder = a.currentHolderId ? personMap.get(a.currentHolderId) : null;
  const holderLocation = currentHolder?.locationId ? locMap.get(currentHolder.locationId) : null;

  return (
    <div className="space-y-6">
      {flash && (
        <div
          className={`rounded px-4 py-2 text-sm border ${flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}
        >
          {flash.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
              ← Список
            </Link>
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${a.type === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}
            >
              {a.type === 'active' ? 'Актив' : 'Компонент'}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{a.name}</h1>
          {a.serial && <p className="text-sm text-gray-500">S/N: {a.serial}</p>}
          {a.comments && <p className="mt-1 text-sm text-gray-600">{a.comments}</p>}
        </div>
        <div className="text-right text-sm text-gray-500">
          <div>Додано: {formatDate(a.createdAt)}</div>
          {a.type === 'active' && (
            <div>
              Статус:{' '}
              <span className={a.status === 'На складі' ? 'text-green-600' : 'text-amber-600'}>{a.status}</span>
            </div>
          )}
          {a.type === 'component' && <div>На складі: {a.quantity ?? 0} шт.</div>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          {/* ── Active asset: holder & assign ──────────────────────────────────── */}
          {a.type === 'active' && (
            <>
              <section className="rounded border border-gray-200 p-4 space-y-3">
                <h2 className="font-medium text-gray-900">Держатель</h2>
                {currentHolder ? (
                  <div className="text-sm">
                    <Link href={`/people/${currentHolder.id}`} className="font-medium text-blue-600 hover:underline">
                      {currentHolder.name}
                    </Link>
                    {holderLocation && <span className="text-gray-500"> / {holderLocation.name}</span>}
                    {currentHolder.phone && <div className="text-gray-500">{currentHolder.phone}</div>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">На складі</p>
                )}

                {/* Return button */}
                {currentHolder && (
                  <form action={returnAsset}>
                    <input type="hidden" name="asset_id" value={a.id} />
                    <button type="submit" className={btnSecondary}>
                      Повернути на склад
                    </button>
                  </form>
                )}
              </section>

              {/* Assign / Transfer */}
              <section className="rounded border border-gray-200 p-4 space-y-3">
                <h2 className="font-medium text-gray-900">
                  {currentHolder ? 'Передати іншому' : 'Видати'}
                </h2>
                <form action={assignAsset} className="space-y-3">
                  <input type="hidden" name="asset_id" value={a.id} />
                  <div className="space-y-1">
                    <label className={labelCls}>Отримувач</label>
                    <select name="person_id" required className={inputCls}>
                      <option value="">— обрати особу —</option>
                      {persons
                        .filter(p => p.id !== a.currentHolderId)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.locationId ? ` / ${locMap.get(p.locationId)?.name ?? ''}` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Коментар</label>
                    <input name="comment" type="text" placeholder="Необов'язково" className={inputCls} />
                  </div>
                  <button type="submit" className={btnPrimary}>
                    {currentHolder ? 'Передати' : 'Видати'}
                  </button>
                </form>
              </section>

              {/* Tasks */}
              <section className="rounded border border-gray-200 p-4 space-y-3">
                <h2 className="font-medium text-gray-900">Задачі</h2>

                {/* Add task form */}
                <form action={addTask} className="flex gap-2">
                  <input type="hidden" name="asset_id" value={a.id} />
                  <input
                    name="text"
                    type="text"
                    placeholder="Нова задача…"
                    required
                    className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
                  />
                  <button type="submit" className={btnPrimary}>
                    Додати
                  </button>
                </form>

                {/* Active tasks */}
                {activeTasks.length > 0 && (
                  <ul className="space-y-2">
                    {activeTasks.map(t => (
                      <li key={t.id} className="rounded bg-amber-50 border border-amber-200 p-3">
                        <p className="text-sm font-medium text-gray-900">{t.text}</p>
                        <p className="text-xs text-gray-500">{formatDateTime(t.createdAt)}</p>
                        <form action={closeTask} className="mt-2 flex gap-2">
                          <input type="hidden" name="task_id" value={t.id} />
                          <input type="hidden" name="asset_id" value={a.id} />
                          <input
                            name="close_comment"
                            type="text"
                            placeholder="Коментар до закриття"
                            className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                          />
                          <button type="submit" className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">
                            Закрити
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                {activeTasks.length === 0 && <p className="text-sm text-gray-500">Активних задач немає</p>}

                {/* Closed tasks (last 5) */}
                {closedTasks.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-900">
                      Закриті задачі ({closedTasks.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {closedTasks.map(t => (
                        <li key={t.id} className="text-gray-500 line-through">
                          {t.text}
                          <span className="ml-2 no-underline not-italic">— {formatDate(t.closedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            </>
          )}

          {/* ── Component: holders & actions ───────────────────────────────────── */}
          {a.type === 'component' && (
            <>
              {/* Holders table */}
              {holders.length > 0 && (
                <section className="rounded border border-gray-200 p-4 space-y-2">
                  <h2 className="font-medium text-gray-900">Держателі</h2>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-700">
                        <th className="pb-1 pr-3 font-medium">Особа</th>
                        <th className="pb-1 pr-3 font-medium">Локація</th>
                        <th className="pb-1 font-medium">Кількість</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holders.map(h => {
                        const loc = h.person.locationId ? locMap.get(h.person.locationId) : null;
                        return (
                          <tr key={h.person.id} className="border-b border-gray-100">
                            <td className="py-1 pr-3">
                              <Link href={`/people/${h.person.id}`} className="text-blue-600 hover:underline">
                                {h.person.name}
                              </Link>
                            </td>
                            <td className="py-1 pr-3 text-gray-500">{loc?.name ?? '—'}</td>
                            <td className="py-1 font-medium">{h.qty}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              )}

              {/* Issue from stock */}
              <section className="rounded border border-gray-200 p-4 space-y-3">
                <h2 className="font-medium text-gray-900">Видати зі складу</h2>
                <form action={assignAsset} className="space-y-3">
                  <input type="hidden" name="asset_id" value={a.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={labelCls}>Отримувач</label>
                      <select name="person_id" required className={inputCls}>
                        <option value="">— особа —</option>
                        {persons.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Кількість</label>
                      <input name="quantity" type="number" min="1" defaultValue="1" className={inputCls} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Коментар</label>
                    <input name="comment" type="text" placeholder="Необов'язково" className={inputCls} />
                  </div>
                  <button type="submit" className={btnPrimary}>
                    Видати
                  </button>
                </form>
              </section>

              {/* Return from person */}
              {holders.length > 0 && (
                <section className="rounded border border-gray-200 p-4 space-y-3">
                  <h2 className="font-medium text-gray-900">Повернути від особи</h2>
                  <form action={returnAsset} className="space-y-3">
                    <input type="hidden" name="asset_id" value={a.id} />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className={labelCls}>Від кого</label>
                        <select name="person_id" required className={inputCls}>
                          <option value="">— особа —</option>
                          {holders.map(h => (
                            <option key={h.person.id} value={h.person.id}>
                              {h.person.name} (є: {h.qty})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={labelCls}>Кількість</label>
                        <input name="quantity" type="number" min="1" defaultValue="1" className={inputCls} />
                      </div>
                    </div>
                    <button type="submit" className={btnSecondary}>
                      Повернути
                    </button>
                  </form>
                </section>
              )}

              {/* Transfer person-to-person */}
              {holders.length > 0 && (
                <section className="rounded border border-gray-200 p-4 space-y-3">
                  <h2 className="font-medium text-gray-900">Передати між особами</h2>
                  <form action={assignAsset} className="space-y-3">
                    <input type="hidden" name="asset_id" value={a.id} />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className={labelCls}>Від кого</label>
                        <select name="from_person_id" required className={inputCls}>
                          <option value="">— особа —</option>
                          {holders.map(h => (
                            <option key={h.person.id} value={h.person.id}>
                              {h.person.name} (є: {h.qty})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={labelCls}>Кому</label>
                        <select name="person_id" required className={inputCls}>
                          <option value="">— особа —</option>
                          {persons.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Кількість</label>
                      <input name="quantity" type="number" min="1" defaultValue="1" className={inputCls} />
                    </div>
                    <button type="submit" className={btnPrimary}>
                      Передати
                    </button>
                  </form>
                </section>
              )}

              {/* Supply */}
              <section className="rounded border border-gray-200 p-4 space-y-3">
                <h2 className="font-medium text-gray-900">Поставка на склад</h2>
                <form action={addSupply} className="space-y-3">
                  <input type="hidden" name="asset_id" value={a.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={labelCls}>Кількість</label>
                      <input name="quantity" type="number" min="1" defaultValue="1" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Коментар</label>
                      <input name="comment" type="text" placeholder="Поставка компоненту" className={inputCls} />
                    </div>
                  </div>
                  <button type="submit" className={btnSecondary}>
                    Додати на склад
                  </button>
                </form>
              </section>
            </>
          )}
        </div>

        {/* RIGHT COLUMN: Edit + History */}
        <div className="space-y-4">
          {/* Edit */}
          <section className="rounded border border-gray-200 p-4 space-y-3">
            <h2 className="font-medium text-gray-900">Редагувати</h2>
            <form action={editAsset} className="space-y-3">
              <input type="hidden" name="asset_id" value={a.id} />
              <div className="space-y-1">
                <label className={labelCls}>Назва</label>
                <input name="name" type="text" required defaultValue={a.name} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Серійний номер</label>
                <input name="serial" type="text" defaultValue={a.serial ?? ''} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Коментар</label>
                <textarea name="comments" rows={2} defaultValue={a.comments ?? ''} className={inputCls} />
              </div>
              <button type="submit" className={btnSecondary}>
                Зберегти
              </button>
            </form>
          </section>

          {/* History */}
          <section className="rounded border border-gray-200 p-4 space-y-3">
            <h2 className="font-medium text-gray-900">
              Історія{' '}
              <span className="text-sm font-normal text-gray-500">({histTotal})</span>
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="pb-1 pr-3 font-medium">Дія</th>
                  <th className="pb-1 pr-3 font-medium">Дата</th>
                  <th className="pb-1 font-medium">Коментар</th>
                </tr>
              </thead>
              <tbody>
                {histSlice.map(log => {
                  const p = log.personId ? personMap.get(log.personId) : null;
                  return (
                    <tr key={log.id} className="border-b border-gray-100 align-top">
                      <td className="py-1.5 pr-3">
                        <span className="font-medium text-gray-800">{log.action}</span>
                        {log.quantity != null && (
                          <span className="ml-1 text-gray-500">×{log.quantity}</span>
                        )}
                        {p && (
                          <div className="text-xs text-gray-500">
                            <Link href={`/people/${p.id}`} className="hover:underline">
                              {p.name}
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="py-1.5 text-xs text-gray-600">{log.comment}</td>
                    </tr>
                  );
                })}
                {histSlice.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">
                      Журнал порожній
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* History pagination */}
            {histPages > 1 && (
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: histPages }, (_, i) => i + 1).map(p => (
                  <a
                    key={p}
                    href={`/assets/${assetId}?hpage=${p}`}
                    className={`rounded px-2 py-0.5 text-xs ${p === curHPage ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
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

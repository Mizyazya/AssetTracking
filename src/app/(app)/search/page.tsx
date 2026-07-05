import Link from 'next/link';
import { and, count, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { asset, location, person, task } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { holdersForAssets } from '@/lib/ledger';
import { getLocationBreakdown } from '@/lib/dashboard';
import { addTask, closeTask } from '@/lib/asset-actions';
import { formatDate, formatDateTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

const RESULT_LIMIT = 25;

// SQLite's LIKE only case-folds ASCII, so a plain SQL `like()` misses
// "ноутбук" vs "Ноутбук" — filter matching happens in JS instead, where
// toLowerCase() handles Cyrillic correctly.
function includesCi(haystack: string | null | undefined, needle: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(needle);
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const returnTo = `/search?q=${encodeURIComponent(q)}`;

  const persons = db.select().from(person).all();
  const personMap = new Map(persons.map(p => [p.id, p]));
  const allLocations = db.select().from(location).all();
  const locationMap = new Map(allLocations.map(l => [l.id, l]));

  type AssetResult = typeof asset.$inferSelect & {
    holderText: string | null;
    locationName: string | null;
    activeTaskCount: number;
  };
  type PersonResult = typeof person.$inferSelect & {
    locationName: string | null;
    activeCount: number;
    compCount: number;
  };
  type LocationResult = typeof location.$inferSelect & { peopleCount: number; assetQty: number };
  type TaskResult = typeof task.$inferSelect & {
    assetName: string;
    holderName: string | null;
    locationName: string | null;
  };

  let assets: AssetResult[] = [];
  let people: PersonResult[] = [];
  let locations: LocationResult[] = [];
  let tasks: TaskResult[] = [];

  if (q) {
    const needle = q.toLowerCase();

    const matchedAssets = db
      .select()
      .from(asset)
      .all()
      .filter(a => includesCi(a.name, needle) || includesCi(a.serial, needle) || includesCi(a.comments, needle))
      .slice(0, RESULT_LIMIT);

    const activeTaskCountRows = db.select({ assetId: task.assetId }).from(task).where(eq(task.status, 'active')).all();
    const activeTaskCountMap = new Map<number, number>();
    for (const r of activeTaskCountRows) {
      activeTaskCountMap.set(r.assetId, (activeTaskCountMap.get(r.assetId) ?? 0) + 1);
    }

    const compIds = matchedAssets.filter(a => a.type === 'component').map(a => a.id);
    const ledger = holdersForAssets(compIds);

    assets = matchedAssets.map(a => {
      let holderText: string | null = null;
      let locationName: string | null = null;

      if (a.type === 'active') {
        if (a.currentHolderId) {
          const p = personMap.get(a.currentHolderId);
          holderText = p?.name ?? null;
          locationName = p?.locationId ? (locationMap.get(p.locationId)?.name ?? null) : null;
        }
      } else {
        const holders = ledger.get(a.id) ?? new Map();
        const names = Array.from(holders.entries()).map(([pid, qty]) => `${personMap.get(pid)?.name ?? '?'} ×${qty}`);
        holderText = names.length > 0 ? names.join(', ') : null;
      }

      return { ...a, holderText, locationName, activeTaskCount: activeTaskCountMap.get(a.id) ?? 0 };
    });

    const matchedPeople = persons.filter(p => includesCi(p.name, needle)).slice(0, RESULT_LIMIT);

    const activeCountRows = db
      .select({ personId: asset.currentHolderId, cnt: count() })
      .from(asset)
      .where(and(eq(asset.type, 'active'), isNotNull(asset.currentHolderId)))
      .groupBy(asset.currentHolderId)
      .all();
    const activeCountMap = new Map(activeCountRows.map(r => [r.personId as number, r.cnt]));

    const allCompIds = db.select({ id: asset.id }).from(asset).where(eq(asset.type, 'component')).all().map(r => r.id);
    const compLedgerAll = holdersForAssets(allCompIds);
    const compCountMap = new Map<number, number>();
    for (const holders of compLedgerAll.values()) {
      for (const [pid, qty] of holders) {
        compCountMap.set(pid, (compCountMap.get(pid) ?? 0) + qty);
      }
    }

    people = matchedPeople.map(p => ({
      ...p,
      locationName: p.locationId ? (locationMap.get(p.locationId)?.name ?? null) : null,
      activeCount: activeCountMap.get(p.id) ?? 0,
      compCount: compCountMap.get(p.id) ?? 0,
    }));

    const matchedLocations = allLocations.filter(l => includesCi(l.name, needle)).slice(0, RESULT_LIMIT);
    const { rows: breakdownRows } = getLocationBreakdown();
    const breakdownMap = new Map(breakdownRows.map(r => [r.location.id, r.qty]));
    const peopleCountByLocation = new Map<number, number>();
    for (const p of persons) {
      if (p.locationId == null) continue;
      peopleCountByLocation.set(p.locationId, (peopleCountByLocation.get(p.locationId) ?? 0) + 1);
    }
    locations = matchedLocations.map(l => ({
      ...l,
      peopleCount: peopleCountByLocation.get(l.id) ?? 0,
      assetQty: breakdownMap.get(l.id) ?? 0,
    }));

    const assetMap = new Map(db.select({ id: asset.id, name: asset.name, currentHolderId: asset.currentHolderId }).from(asset).all().map(a => [a.id, a]));
    tasks = db
      .select()
      .from(task)
      .all()
      .filter(t => includesCi(t.text, needle))
      .slice(0, RESULT_LIMIT)
      .map(t => {
        const a = assetMap.get(t.assetId);
        const holder = a?.currentHolderId ? personMap.get(a.currentHolderId) : null;
        return {
          ...t,
          assetName: a?.name ?? `#${t.assetId}`,
          holderName: holder?.name ?? null,
          locationName: holder?.locationId ? (locationMap.get(holder.locationId)?.name ?? null) : null,
        };
      });
  }

  const totalResults = assets.length + people.length + locations.length + tasks.length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Пошук</h1>

      <form method="get" action="/search" className="flex gap-2" style={{ maxWidth: '28rem' }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Пошук по майну, людях, локаціях, задачах..."
          className="input"
          autoFocus
        />
        <button type="submit" className="btn primary">Знайти</button>
      </form>

      {!q && (
        <p style={{ color: 'var(--fg-subtle)' }}>Введіть пошуковий запит.</p>
      )}

      {q && totalResults === 0 && (
        <div className="card text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-6)' }}>
          Нічого не знайдено за запитом «{q}»
        </div>
      )}

      {q && assets.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Майно ({assets.length})</h2>
          <ul className="space-y-3">
            {assets.map(a => (
              <li key={a.id} style={{ borderBottom: '1px solid var(--border-muted)', paddingBottom: 'var(--space-3)' }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/assets/${a.id}`} className="font-medium" style={{ color: 'var(--primary)' }}>
                        {a.name}
                      </Link>
                      <span className={`badge ${a.type === 'active' ? 'primary' : 'info'}`}>
                        {a.type === 'active' ? 'Актив' : 'Компонент'}
                      </span>
                      {a.activeTaskCount > 0 && <span className="badge warning">{a.activeTaskCount} задач</span>}
                    </div>
                    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                      {a.serial && <span>{a.serial} · </span>}
                      {a.holderText ? (
                        <span>
                          {a.holderText}
                          {a.locationName && <span> / {a.locationName}</span>}
                        </span>
                      ) : (
                        <span>На складі</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/assets/${a.id}`} className="btn secondary sm">Передати →</Link>
                  </div>
                </div>
                <form action={addTask} className="flex flex-wrap items-center gap-2" style={{ marginTop: 'var(--space-2)' }}>
                  <input type="hidden" name="asset_id" value={a.id} />
                  <input name="text" placeholder="Нова задача..." className="input" style={{ maxWidth: '16rem' }} />
                  <button type="submit" className="btn ghost sm">+ Задача</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && people.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Люди ({people.length})</h2>
          <ul className="space-y-2">
            {people.map(p => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/people/${p.id}`} style={{ color: 'var(--primary)' }}>{p.name}</Link>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                    {p.locationName && <span> · {p.locationName}</span>}
                    {p.phone && <span> · {p.phone}</span>}
                    {p.activeCount > 0 && <span> · активів: {p.activeCount}</span>}
                    {p.compCount > 0 && <span> · компонентів: {p.compCount}</span>}
                  </span>
                </div>
                <Link href={`/?person_id=${p.id}`} className="btn secondary sm">Показати майно →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && locations.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Локації ({locations.length})</h2>
          <ul className="space-y-2">
            {locations.map(l => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/locations/${l.id}`} style={{ color: 'var(--primary)' }}>{l.name}</Link>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                    {' '}
                    · людей: {l.peopleCount} · майна: {l.assetQty}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/people?location_id=${l.id}`} className="btn secondary sm">Люди →</Link>
                  <Link href={`/?location_id=${l.id}`} className="btn secondary sm">Майно →</Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && tasks.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Задачі ({tasks.length})</h2>
          <ul className="space-y-3">
            {tasks.map(t => (
              <li key={t.id} style={{ borderBottom: '1px solid var(--border-muted)', paddingBottom: 'var(--space-2)' }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div>
                      <Link href={`/assets/${t.assetId}`} style={{ color: 'var(--primary)' }}>{t.assetName}</Link>
                      <span style={{ color: 'var(--fg-muted)' }}> — {t.text}</span>
                      {t.status === 'closed' && (
                        <span className="badge" style={{ marginLeft: 'var(--space-2)' }}>закрито</span>
                      )}
                    </div>
                    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                      {t.holderName && <span>{t.holderName}{t.locationName && ` / ${t.locationName}`} · </span>}
                      {t.status === 'closed'
                        ? `Закрито: ${formatDate(t.closedAt)}`
                        : `Створено: ${formatDateTime(t.createdAt)}`}
                    </p>
                  </div>
                  {t.status === 'active' && (
                    <form action={closeTask} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="task_id" value={t.id} />
                      <input type="hidden" name="asset_id" value={t.assetId} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input name="close_comment" placeholder="Коментар" className="input" style={{ width: '9rem' }} />
                      <button type="submit" className="btn primary sm">Закрити</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

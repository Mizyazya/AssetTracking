import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { asset, assetLog, location, person, task } from '@/db/schema';
import { holdersForAssets } from './ledger';

const OVERDUE_DAYS = 14;

export function getTaskStats() {
  const activeTasks = db
    .select({ id: task.id, createdAt: task.createdAt })
    .from(task)
    .where(eq(task.status, 'active'))
    .all();

  const overdueBefore = new Date(Date.now() - OVERDUE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const overdueCount = activeTasks.filter(t => (t.createdAt ?? '') < overdueBefore).length;

  return { activeCount: activeTasks.length, overdueCount, overdueDays: OVERDUE_DAYS };
}

export function getTopHolders(limit = 5) {
  const persons = db.select().from(person).all();
  const personMap = new Map(persons.map(p => [p.id, p]));

  const actives = db
    .select({ currentHolderId: asset.currentHolderId })
    .from(asset)
    .where(eq(asset.type, 'active'))
    .all();
  const components = db.select({ id: asset.id }).from(asset).where(eq(asset.type, 'component')).all();

  const totals = new Map<number, number>();
  for (const a of actives) {
    if (a.currentHolderId == null) continue;
    totals.set(a.currentHolderId, (totals.get(a.currentHolderId) ?? 0) + 1);
  }

  const ledger = holdersForAssets(components.map(c => c.id));
  for (const holders of ledger.values()) {
    for (const [personId, qty] of holders) {
      totals.set(personId, (totals.get(personId) ?? 0) + qty);
    }
  }

  return Array.from(totals.entries())
    .map(([personId, qty]) => ({ person: personMap.get(personId) ?? null, qty }))
    .filter((x): x is { person: NonNullable<typeof x.person>; qty: number } => x.person !== null)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function getRecentActivity(limit = 10) {
  const logs = db.select().from(assetLog).orderBy(desc(assetLog.timestamp)).limit(limit).all();

  const assetIds = Array.from(new Set(logs.map(l => l.assetId)));
  const personIds = Array.from(new Set(logs.map(l => l.personId).filter((x): x is number => x != null)));

  const assets = assetIds.length ? db.select().from(asset).where(inArray(asset.id, assetIds)).all() : [];
  const persons = personIds.length ? db.select().from(person).where(inArray(person.id, personIds)).all() : [];
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const personMap = new Map(persons.map(p => [p.id, p]));

  return logs.map(l => ({
    ...l,
    assetName: assetMap.get(l.assetId)?.name ?? `#${l.assetId}`,
    personName: l.personId ? (personMap.get(l.personId)?.name ?? null) : null,
  }));
}

export function getLocationBreakdown() {
  const locations = db.select().from(location).orderBy(location.name).all();
  const persons = db.select().from(person).all();
  const personMap = new Map(persons.map(p => [p.id, p]));

  const actives = db
    .select({ currentHolderId: asset.currentHolderId })
    .from(asset)
    .where(eq(asset.type, 'active'))
    .all();
  const components = db.select({ id: asset.id }).from(asset).where(eq(asset.type, 'component')).all();
  const ledger = holdersForAssets(components.map(c => c.id));

  const counts = new Map<number, number>();
  let unassigned = 0;

  for (const a of actives) {
    const p = a.currentHolderId != null ? personMap.get(a.currentHolderId) : null;
    if (!p || p.locationId == null) {
      unassigned += 1;
      continue;
    }
    counts.set(p.locationId, (counts.get(p.locationId) ?? 0) + 1);
  }

  for (const holders of ledger.values()) {
    for (const [personId, qty] of holders) {
      const p = personMap.get(personId);
      if (!p || p.locationId == null) {
        unassigned += qty;
        continue;
      }
      counts.set(p.locationId, (counts.get(p.locationId) ?? 0) + qty);
    }
  }

  const rows = locations.map(l => ({ location: l, qty: counts.get(l.id) ?? 0 }));
  const max = Math.max(1, unassigned, ...rows.map(r => r.qty));

  return { rows, unassigned, max };
}

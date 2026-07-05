import { NextRequest } from 'next/server';
import { and, eq, isNotNull, like, count } from 'drizzle-orm';
import { db } from '@/db';
import { asset, location, person } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { holdersForAssets } from '@/lib/ledger';
import { csvResponse, toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  await requireUser();
  const sp = req.nextUrl.searchParams;

  const fName = sp.get('name') ?? '';
  const fLocationId = sp.get('location_id') ?? '';
  const fHasAssets = sp.get('has_assets') ?? '';

  const locations = db.select().from(location).all();
  const locMap = new Map(locations.map(l => [l.id, l.name]));

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

  const csv = toCsv(
    ["Ім'я", 'Локація', 'Телефон', 'Активів', 'Компонентів'],
    rows.map(p => [
      p.name,
      p.locationId ? (locMap.get(p.locationId) ?? '') : '',
      p.phone ?? '',
      p.activeCount,
      p.compCount,
    ]),
  );

  return csvResponse('people.csv', csv);
}

import { NextRequest } from 'next/server';
import { and, eq, like } from 'drizzle-orm';
import { db } from '@/db';
import { asset, location, person, task } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { holdersForAssets } from '@/lib/ledger';
import { formatDate } from '@/lib/time';
import { csvResponse, toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  await requireUser();
  const sp = req.nextUrl.searchParams;

  const fName = sp.get('name') ?? '';
  const fSerial = sp.get('serial') ?? '';
  const fType = sp.get('type') ?? '';
  const fPersonId = sp.get('person_id') ? parseInt(sp.get('person_id')!) : null;
  const fLocationId = sp.get('location_id') ? parseInt(sp.get('location_id')!) : null;

  const conds = [];
  if (fName) conds.push(like(asset.name, `%${fName}%`));
  if (fSerial) conds.push(like(asset.serial, `%${fSerial}%`));
  if (fType === 'active' || fType === 'component') conds.push(eq(asset.type, fType));

  const rawAssets = db
    .select()
    .from(asset)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .all();

  const persons = db.select().from(person).all();
  const locations = db.select().from(location).all();
  const personMap = new Map(persons.map(p => [p.id, p]));
  const locMap = new Map(locations.map(l => [l.id, l]));

  const taskCountRows = db
    .select({ assetId: task.assetId })
    .from(task)
    .where(eq(task.status, 'active'))
    .all();
  const taskCountMap = new Map<number, number>();
  for (const r of taskCountRows) {
    taskCountMap.set(r.assetId, (taskCountMap.get(r.assetId) ?? 0) + 1);
  }

  const compIds = rawAssets.filter(a => a.type === 'component').map(a => a.id);
  const ledger = holdersForAssets(compIds);

  const rows = rawAssets
    .map(a => {
      let holderName = '';
      let locationName = '';

      if (a.type === 'active' && a.currentHolderId) {
        const p = personMap.get(a.currentHolderId);
        holderName = p?.name ?? '';
        locationName = p?.locationId ? (locMap.get(p.locationId)?.name ?? '') : '';
      } else if (a.type === 'component') {
        const holders = ledger.get(a.id) ?? new Map();
        holderName = Array.from(holders.entries())
          .map(([pid, qty]) => `${personMap.get(pid)?.name ?? '?'} ×${qty}`)
          .join('; ');
      }

      return { a, holderName, locationName };
    })
    .filter(({ a }) => {
      if (fPersonId) {
        if (a.type === 'active' && a.currentHolderId !== fPersonId) return false;
        if (a.type === 'component' && !(ledger.get(a.id) ?? new Map()).has(fPersonId)) return false;
      }
      if (fLocationId) {
        const p = a.type === 'active' && a.currentHolderId ? personMap.get(a.currentHolderId) : null;
        if (a.type === 'active' && p?.locationId !== fLocationId) return false;
        if (a.type === 'component') {
          const holders = ledger.get(a.id) ?? new Map();
          const matches = Array.from(holders.keys()).some(pid => personMap.get(pid)?.locationId === fLocationId);
          if (!matches) return false;
        }
      }
      return true;
    });

  const csv = toCsv(
    ['Назва', 'Серійний номер', 'Тип', 'Держатель', 'Локація', 'Активних задач', 'Дата створення'],
    rows.map(({ a, holderName, locationName }) => [
      a.name,
      a.serial ?? '',
      a.type === 'active' ? 'Актив' : 'Компонент',
      holderName,
      locationName,
      taskCountMap.get(a.id) ?? 0,
      formatDate(a.createdAt),
    ]),
  );

  return csvResponse('assets.csv', csv);
}

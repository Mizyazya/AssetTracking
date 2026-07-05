import { NextRequest } from 'next/server';
import { and, eq, gte, lte, like } from 'drizzle-orm';
import { db } from '@/db';
import { asset, location, person, task } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { formatDateTime, formatDate } from '@/lib/time';
import { csvResponse, toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  await requireUser();
  const sp = req.nextUrl.searchParams;

  const fLocationId = sp.get('location_id') ? parseInt(sp.get('location_id')!) : null;
  const fPersonId = sp.get('person_id') ? parseInt(sp.get('person_id')!) : null;
  const fAssetName = sp.get('asset_name') ?? '';
  const fTaskText = sp.get('task_text') ?? '';
  const fDateFrom = sp.get('date_from') ?? '';
  const fDateTo = sp.get('date_to') ?? '';
  const fClosedFrom = sp.get('closed_from') ?? '';
  const fClosedTo = sp.get('closed_to') ?? '';

  const persons = db.select().from(person).all();
  const personMap = new Map(persons.map(p => [p.id, p]));
  const locations = db.select().from(location).all();
  const locMap = new Map(locations.map(l => [l.id, l]));

  const taskConds = [];
  if (fAssetName) taskConds.push(like(asset.name, `%${fAssetName}%`));
  if (fTaskText) taskConds.push(like(task.text, `%${fTaskText}%`));
  if (fDateFrom) taskConds.push(gte(task.createdAt, fDateFrom));
  if (fDateTo) taskConds.push(lte(task.createdAt, fDateTo + 'T23:59:59'));

  const allTasks = db
    .select({
      id: task.id,
      assetId: task.assetId,
      text: task.text,
      status: task.status,
      createdAt: task.createdAt,
      closedAt: task.closedAt,
      closeComment: task.closeComment,
      assetName: asset.name,
      currentHolderId: asset.currentHolderId,
    })
    .from(task)
    .innerJoin(asset, and(eq(task.assetId, asset.id), eq(asset.type, 'active')))
    .where(taskConds.length > 0 ? and(...taskConds) : undefined)
    .all();

  const filtered = allTasks.filter(t => {
    if (fPersonId && t.currentHolderId !== fPersonId) return false;
    if (fLocationId) {
      const holder = t.currentHolderId ? personMap.get(t.currentHolderId) : null;
      if (holder?.locationId !== fLocationId) return false;
    }
    if (t.status === 'closed') {
      if (fClosedFrom && (t.closedAt ?? '') < fClosedFrom) return false;
      if (fClosedTo && (t.closedAt ?? '') > fClosedTo + 'T23:59:59') return false;
    }
    return true;
  });

  const csv = toCsv(
    ['Задача', 'Майно', 'Статус', 'Держатель', 'Локація', 'Створено', 'Закрито', 'Коментар'],
    filtered.map(t => {
      const holder = t.currentHolderId ? personMap.get(t.currentHolderId) : null;
      const loc = holder?.locationId ? locMap.get(holder.locationId) : null;
      return [
        t.text,
        t.assetName,
        t.status === 'closed' ? 'Закрита' : 'Активна',
        holder?.name ?? '',
        loc?.name ?? '',
        formatDateTime(t.createdAt),
        t.closedAt ? formatDate(t.closedAt) : '',
        t.closeComment ?? '',
      ];
    }),
  );

  return csvResponse('tasks.csv', csv);
}

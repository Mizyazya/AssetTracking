import { db } from '@/db';
import { assetLog } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export type Holders = Map<number, number>; // personId → qty

type LogRow = { personId: number | null; action: string | null; quantity: number | null };

function replayLogs(logs: LogRow[]): Holders {
  const balance = new Map<number, number>();
  for (const row of logs) {
    if (row.personId == null || row.quantity == null) continue;
    if (row.action === 'Видано') {
      balance.set(row.personId, (balance.get(row.personId) ?? 0) + row.quantity);
    } else if (row.action === 'Повернення' || row.action === 'Повернено') {
      balance.set(row.personId, (balance.get(row.personId) ?? 0) - row.quantity);
    }
  }
  for (const [pid, qty] of balance) {
    if (qty <= 0) balance.delete(pid);
  }
  return balance;
}

export function componentHolders(assetId: number): Holders {
  const logs = db
    .select({ personId: assetLog.personId, action: assetLog.action, quantity: assetLog.quantity })
    .from(assetLog)
    .where(eq(assetLog.assetId, assetId))
    .orderBy(assetLog.timestamp)
    .all();
  return replayLogs(logs);
}

export function holderBalance(assetId: number, personId: number): number {
  return componentHolders(assetId).get(personId) ?? 0;
}

export function holdersForAssets(assetIds: number[]): Map<number, Holders> {
  if (assetIds.length === 0) return new Map();
  const logs = db
    .select({
      assetId: assetLog.assetId,
      personId: assetLog.personId,
      action: assetLog.action,
      quantity: assetLog.quantity,
    })
    .from(assetLog)
    .where(inArray(assetLog.assetId, assetIds))
    .orderBy(assetLog.timestamp)
    .all();

  const grouped = new Map<number, LogRow[]>();
  for (const log of logs) {
    if (!grouped.has(log.assetId)) grouped.set(log.assetId, []);
    grouped.get(log.assetId)!.push(log);
  }

  const result = new Map<number, Holders>();
  for (const [aid, assetLogs] of grouped) {
    result.set(aid, replayLogs(assetLogs));
  }
  return result;
}

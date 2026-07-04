/**
 * Імпорт даних зі старої БД v1 (Flask, instance/assets.db) у нову (data/assets.db).
 *
 * Використання:  npm run db:migrate && npx tsx scripts/import-v1.ts <шлях-до-старої-БД>
 * За замовчуванням шлях — instance/assets.db. Нова БД має бути порожньою (свіжі міграції).
 *
 * Конвертація часу (PORTING.md §8): у v1 asset_log.timestamp, task.created_at і
 * task.closed_at записані київським часом, решта — naive UTC. У v2 все зберігається
 * як UTC ISO. Мікросекунди зберігаються (порядок реплею ledger не змінюється).
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const OLD_DB = process.argv[2] ?? path.join(process.cwd(), 'instance', 'assets.db');
const NEW_DB = path.join(process.cwd(), 'data', 'assets.db');
const KYIV = 'Europe/Kyiv';

// --- Час -------------------------------------------------------------------

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?$/;

function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcMs) / 60_000;
}

function toIso(ms: number, fraction: string): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '') + fraction + 'Z';
}

/** 'YYYY-MM-DD HH:MM:SS[.ffffff]' у поясі tz → UTC ISO. tz='UTC' — просто переформатування. */
function convert(value: string | null, tz: string): string | null {
  if (value == null) return null;
  const m = TS_RE.exec(value);
  if (!m) return value; // незнайомий формат — переносимо як є
  const [, y, mo, d, h, mi, s, frac] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (tz !== 'UTC') {
    // дві ітерації сходяться і на межах переходу літнього часу
    for (let i = 0; i < 2; i++) {
      const off = tzOffsetMinutes(ms, tz);
      ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - off * 60_000;
    }
  }
  return toIso(ms, frac ?? '');
}

// --- Імпорт ----------------------------------------------------------------

if (!fs.existsSync(OLD_DB)) {
  console.error(`Стара БД не знайдена: ${OLD_DB}`);
  process.exit(1);
}
if (!fs.existsSync(NEW_DB)) {
  console.error(`Нова БД не знайдена: ${NEW_DB}. Спочатку: npm run db:migrate`);
  process.exit(1);
}

const oldDb = new Database(OLD_DB, { readonly: true });
const newDb = new Database(NEW_DB);
newDb.pragma('foreign_keys = ON');

type Row = Record<string, unknown>;
const rows = (table: string): Row[] =>
  oldDb.prepare(`SELECT * FROM "${table}"`).all() as Row[];

const nonEmpty = newDb
  .prepare(`SELECT (SELECT count(*) FROM user) + (SELECT count(*) FROM asset) AS n`)
  .get() as { n: number };
if (nonEmpty.n > 0) {
  console.error('Нова БД не порожня — імпорт лише у свіжу БД. Видаліть data/assets.db і повторіть міграції.');
  process.exit(1);
}

function insertAll(table: string, data: Row[], columns: string[]) {
  const stmt = newDb.prepare(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
     VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
  );
  for (const row of data) stmt.run(Object.fromEntries(columns.map((c) => [c, row[c] ?? null])));
  console.log(`  ${table}: ${data.length}`);
}

const summary: Record<string, { old: number; new: number }> = {};

newDb.transaction(() => {
  console.log('Імпорт:');

  insertAll('location', rows('location'), ['id', 'name']);
  insertAll('person', rows('person'), ['id', 'name', 'location_id', 'phone']);
  insertAll('user', rows('user'), ['id', 'username', 'password_hash', 'role']);

  const assets = rows('asset').map((r) => ({
    ...r,
    created_at: convert(r.created_at as string | null, 'UTC'),
  }));
  insertAll('asset', assets, [
    'id', 'name', 'serial', 'quantity', 'type', 'status',
    'current_holder_id', 'comments', 'created_at',
  ]);

  const logs = rows('asset_log').map((r) => ({
    ...r,
    timestamp: convert(r.timestamp as string | null, KYIV),
  }));
  insertAll('asset_log', logs, [
    'id', 'asset_id', 'person_id', 'action', 'timestamp', 'comment', 'quantity',
  ]);

  const tasks = rows('task').map((r) => ({
    ...r,
    created_at: convert(r.created_at as string | null, KYIV),
    closed_at: convert(r.closed_at as string | null, KYIV),
  }));
  insertAll('task', tasks, [
    'id', 'asset_id', 'text', 'status', 'created_at', 'closed_at', 'close_comment',
  ]);

  const sessions = rows('user_session').map((r) => ({
    ...r,
    login_time: convert(r.login_time as string | null, 'UTC'),
    logout_time: convert(r.logout_time as string | null, 'UTC'),
  }));
  insertAll('user_session', sessions, [
    'id', 'user_id', 'session_id', 'login_time', 'logout_time', 'ip', 'user_agent', 'active',
  ]);
})();

// --- Звірка ----------------------------------------------------------------

let ok = true;
for (const t of ['location', 'person', 'user', 'asset', 'asset_log', 'task', 'user_session']) {
  const o = (oldDb.prepare(`SELECT count(*) n FROM "${t}"`).get() as { n: number }).n;
  const n = (newDb.prepare(`SELECT count(*) n FROM "${t}"`).get() as { n: number }).n;
  summary[t] = { old: o, new: n };
  if (o !== n) ok = false;
}
console.log('\nЗвірка кількостей (стара → нова):');
for (const [t, { old: o, new: n }] of Object.entries(summary))
  console.log(`  ${t}: ${o} → ${n} ${o === n ? 'OK' : '!!! РОЗБІЖНІСТЬ'}`);

oldDb.close();
newDb.close();

if (!ok) {
  console.error('\nІмпорт завершився з розбіжностями.');
  process.exit(1);
}
console.log('\nІмпорт успішний.');

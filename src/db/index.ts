import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

// Шлях до БД — константа, не env (PORTING.md §9). Папки створюються
// автоматично: фікс v1-поведінки, де перший запуск падав без instance/.
export const DATA_DIR = path.join(process.cwd(), 'data');
export const BACKUP_DIR = path.join(process.cwd(), 'backup');
export const DB_PATH = path.join(DATA_DIR, 'assets.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };

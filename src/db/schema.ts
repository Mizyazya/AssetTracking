import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Імена таблиць/колонок збігаються з v1 (див. PORTING.md §1) — імпорт даних
// переносить рядки без перейменувань. Nullability дзеркалить v1.
// Усі мітки часу — UTC, ISO 8601 'YYYY-MM-DDTHH:MM:SS[.ffffff]Z' (PORTING.md §8).

export const location = sqliteTable('location', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

export const person = sqliteTable('person', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  locationId: integer('location_id').references(() => location.id),
  phone: text('phone'),
});

export const asset = sqliteTable('asset', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  serial: text('serial').unique(),
  quantity: integer('quantity').default(1),
  type: text('type', { enum: ['active', 'component'] }).notNull(),
  status: text('status').default('На складі'),
  currentHolderId: integer('current_holder_id').references(() => person.id),
  comments: text('comments'),
  createdAt: text('created_at'),
});

export const assetLog = sqliteTable('asset_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assetId: integer('asset_id')
    .notNull()
    .references(() => asset.id),
  personId: integer('person_id').references(() => person.id),
  action: text('action'),
  timestamp: text('timestamp'),
  comment: text('comment'),
  quantity: integer('quantity'),
});

export const task = sqliteTable('task', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assetId: integer('asset_id')
    .notNull()
    .references(() => asset.id),
  text: text('text').notNull(),
  status: text('status', { enum: ['active', 'closed'] }).default('active'),
  createdAt: text('created_at'),
  closedAt: text('closed_at'),
  closeComment: text('close_comment'),
});

export const user = sqliteTable('user', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).default('user'),
});

export const userSession = sqliteTable('user_session', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().unique(),
  loginTime: text('login_time'),
  logoutTime: text('logout_time'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  active: integer('active', { mode: 'boolean' }).default(true),
  // Оновлюється на кожен автентифікований запит — дозволяє відрізнити
  // "справді ще активна" від "ніхто не позначив неактивною, бо просто
  // закрили вкладку" (сесія технічно спливла за SESSION_MAX_AGE, але
  // рядок active лишався б true назавжди без цього поля).
  lastSeenAt: text('last_seen_at'),
});

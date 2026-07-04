# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

**Assets 2.0** — a rewrite of a Ukrainian-language internal asset-tracking tool (equipment/components, holders, locations, tasks) from Flask to Next.js. The finished Flask app lives in branch **`v1`** (tag `v1.5-final`) and runs in production on the owner's Ubuntu LXC until v2 reaches parity; `main` is v2 under active development. Do not add features to `v1` — critical fixes only.

**[PORTING.md](PORTING.md) is the contract.** It specifies every behavior v2 must replicate (routes, filters, flash-message texts, edge cases) plus the deliberate deviations from v1. Implement against it; consult `git show v1:app.py` only when the spec is ambiguous. All UI text is Ukrainian — exact strings are in PORTING.md.

## Commands

```
npm run dev          # dev server on :3000
npm run build        # production build
npm run lint
npm run db:generate  # drizzle-kit: generate migration from src/db/schema.ts changes
npm run db:migrate   # apply migrations to data/assets.db
npm run db:import [path]  # one-time import of v1 SQLite data (default: instance/assets.db)
```

There is no test suite yet. The DB file is `data/assets.db` (created on first run, gitignored along with `backup/`).

## Architecture

- **Stack**: Next.js App Router (TypeScript) + Drizzle ORM + better-sqlite3 + Tailwind 4. Server-rendered pages with server actions for mutations — mirrors v1's page→POST-form→redirect style.
- **Schema** ([src/db/schema.ts](src/db/schema.ts)): table/column names deliberately match v1's SQLite schema (snake_case, singular) so `scripts/import-v1.ts` copies rows without renaming. Nullability also mirrors v1 — don't tighten it without checking legacy data.
- **Component ledger** (the domain's core invariant, PORTING.md §2): components have no current-holders table; who holds how many is always computed by replaying `asset_log` rows (`'Видано'` +qty, `'Повернення'`/`'Повернено'` −qty). This logic must live ONLY in `src/lib/ledger.ts` — v1's biggest flaw was 6 copies of this loop. Action strings are sentinels stored in historical data: never rename or translate them.
- **Passwords** ([src/lib/password.ts](src/lib/password.ts)): verifies legacy werkzeug hashes (`pbkdf2:...`/`scrypt:...`) and v2's own `scrypt$...` format; werkzeug hashes are transparently re-hashed on successful login (`needsRehash`).
- **Sessions** (PORTING.md §3): signed cookie + `user_session` DB row; 30-minute sliding lifetime; every request must check the DB row is still `active` — that's how admin force-logout works.
- **Timestamps**: stored as UTC ISO strings (`...Z`), displayed in `TIMEZONE` env (default Europe/Kyiv). v1 stored a mix of UTC and Kyiv time — the import script normalizes.
- **Auth rule**: every route except `/login` requires login; admin-only areas are user management and session administration. Default bootstrap user `admin`/`admin` when the user table is empty.

## Environment

`.env`: `SECRET_KEY` (required in production), `TIMEZONE` (optional, default Europe/Kyiv). DB path is a constant, not env. Deployment target is Ubuntu LXC with Node 22 + systemd; deploy flow is `git pull → npm ci → npm run build → systemctl restart` (Phase 8 of the plan — not set up yet).

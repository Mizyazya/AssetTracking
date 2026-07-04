# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Flask-based asset tracking system (Ukrainian internal tool) for tracking equipment/components, who holds them, their location, and open tasks/tickets against them. UI text, flash messages, and log action strings are in Ukrainian.

## Running the app

There is no test suite, linter, or build step configured in this repo.

Local (SQLite, no Docker):
```pwsh
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py                 # dev server on :5000, debug=True
# or
python -m waitress --listen=0.0.0.0:8000 app:app   # (run.ps1)
```
```sh
gunicorn -w 4 -b 0.0.0.0:8000 app:app              # (run.sh)
```

Docker Compose (Postgres, production-like):
```pwsh
docker compose up --build
```
Site is served on `http://localhost:8000`. The `web` service waits on `db:5432` via `wait-for-it.sh` before starting gunicorn. `docker-compose.yml` bind-mounts `instance/`, `backup/`, `static/`, `templates/`, and `wait-for-it.sh` from host paths under `/volume1/docker/trackerasset/...` (this targets a Synology NAS deployment) — expect these host paths to not exist in a generic dev environment.

## Architecture

**Single-file monolith**: all models, routes, auth logic, and app bootstrap live in [app.py](app.py). There are no blueprints, no `models.py`/`routes.py` split, and no application factory — `app`/`db` are module-level globals created at import time.

### Database selection
`DATABASE_URL` env var (loaded via `.env`) selects Postgres; if unset/empty, falls back to local SQLite at `instance/assets.db`. Tables and a default `admin`/`admin` user are auto-created at import time (both under `if __name__ == "__main__"` and the `else` gunicorn-import branch) if no user exists yet — there are no migrations.

### Domain model
- `Location` → has many `Person`
- `Person` → belongs to a `Location`, holds `Asset`s (via `Asset.current_holder_id`)
- `Asset` has a `type`: `'active'` (single current holder, tracked directly on `current_holder_id`) or `'component'` (quantity-based, no dedicated holdings table — see below)
- `AssetLog` is the append-only ledger of everything that happens to an asset (issue/return/transfer/creation/task events)
- `Task` — open/closed tickets against an `Asset` (only shown for `type == 'active'` assets)
- `User` (Flask-Login `UserMixin`, role `admin`/`user`) and `UserSession` (custom login/logout/activity audit trail, separate from Flask's session)

### Component quantity tracking (important, non-obvious)
For `type == 'component'` assets there is **no table of current holdings**. Who holds how many is recomputed on every read by replaying that asset's `AssetLog` rows in timestamp order and summing quantities:
- `action == 'Видано'` (issued) → `+quantity` for `log.person_id`
- `action in ('Повернення', 'Повернено')` (returned) → `-quantity` for `log.person_id`

This exact replay loop is duplicated across `index`, `asset_detail`, `person_detail`, `location_detail`, `assign_asset`, and `return_asset` in app.py. If you change component issue/return semantics or add a new action string, you must update every occurrence, and any new "quantity-affecting" action string needs to be added to all of them consistently. Action strings (`'Видано'`, `'Повернено'`, `'Повернення'`, `'Передано'`, `'Отримано'`, `'Створено'`, `'Поставка'`, `'Задача'`, `'Задача закрита'`) are treated as sentinel values compared by exact string match — there's no enum.

### Auth and session handling
- `protect_all_routes()` runs once at import time and wraps every registered view (except `login` and `static`) in `login_required`, so new routes are automatically auth-gated without needing the decorator explicitly — don't rely on a route being public without checking this function.
- `admin_required` (custom decorator) gates admin-only routes (`/users`, `/add_user`, `/edit_user`, `/delete_user`, `/user_sessions/<id>`) and `abort(403)`s otherwise.
- Beyond Flask-Login's session, a parallel `UserSession` DB record tracks each login (`session['sid']` ties the two together). `before_request` hooks (`check_session_valid`) force logout if the `UserSession` was deactivated elsewhere (e.g., an admin closed it via `/close_session/<id>`) or if `sid` is missing — this is how remote session termination and the "single active session" behavior work.
- Session lifetime is fixed at 30 minutes (`app.permanent_session_lifetime`), refreshed on every authenticated request.
- A user cannot change their own `role` when editing their own profile (`self_edit` flag in `edit_user`), and the last remaining admin cannot be deleted.
- Password policy is enforced by `validate_password()`: 8–64 chars, needs upper, lower, digit, and a symbol.

### Backup
`/backup_database` (POST) writes into `backup/`: a raw file copy for SQLite, or a `pg_dump` custom-format dump (shelled out via `os.system`, parsing `DATABASE_URL` with a regex) for Postgres.

### Templates
Server-rendered Jinja2 templates in `templates/`, styled with a locally-vendored Bootstrap (`static/css/bootstrap.min.css`, `static/js/bootstrap.bundle.min.js`) and Font Awesome — no frontend build pipeline, no npm/node involved.

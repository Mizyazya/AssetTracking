# CLAUDE.md — AssetTracking

Asset-tracking web app for managing equipment, people, and locations. Built with Flask + SQLAlchemy + SQLite. UI text and code comments are in Ukrainian.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+, Flask, Flask-SQLAlchemy |
| Database | SQLite (`instance/assets.db`) |
| ORM | SQLAlchemy (via Flask-SQLAlchemy) |
| Templates | Jinja2 |
| CSS | Bootstrap 5 (local), Font Awesome 6 (local CSS + CDN JS) |
| Timezone | `pytz` — `Europe/Kyiv` for all timestamps |

No test suite, no migrations framework, no task runner. Everything is in a single `app.py`.

---

## Running the App

```sh
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py                   # starts at http://localhost:5000, debug=True
```

The SQLite database is auto-created on first run via `db.create_all()` in `__main__`. The database file lives at `instance/assets.db` (gitignored).

---

## Project Structure

```
app.py                  # entire application: models + routes
requirements.txt        # flask, flask_sqlalchemy, pytz
templates/
  base.html             # navbar, theme toggle, toast notifications, footer
  index.html            # asset list with filters and add-asset form
  asset_detail.html     # single asset view, log history, assign/return/tasks
  people.html           # people list with filters
  person_detail.html    # single person, their assets and log history
  edit_person.html      # edit name/phone/location for a person
  locations.html        # locations list with add/edit/delete
  location_detail.html  # single location, its people and their assets
  tasks.html            # global task view — active grouped by asset, closed paginated
static/
  css/bootstrap.min.css
  css/fontawesome.min.css
  js/bootstrap.bundle.min.js
  fonts/fontawesome-webfont.woff2
instance/               # gitignored — SQLite DB lives here
backup/                 # gitignored — DB backups written here
```

---

## Data Models (`app.py`)

### Location
```
id, name
→ people (one-to-many)
```

### Person
```
id, name, phone, location_id (FK → Location)
→ assets (one-to-many via current_holder_id, only 'active' type)
→ logs (backref from AssetLog)
```

### Asset
```
id, name, serial (unique, nullable), quantity, type, status, current_holder_id (FK → Person), comments, created_at
```

`type` is either `'active'` or `'component'` — this distinction drives all business logic.

### AssetLog
```
id, asset_id (FK), person_id (FK, nullable), action, timestamp, comment, quantity (nullable)
→ asset, person (relationships)
```
Timestamp defaults to `datetime.now(KYIV_TZ)`.

### Task
```
id, asset_id (FK), text, status ('active'|'closed'), created_at, closed_at, close_comment
→ asset (relationship)
```
Tasks only apply to `'active'`-type assets (enforced in templates and queries).

---

## Asset Type System

This is the most important concept in the codebase.

### `active` — individual items
- One holder at a time, tracked via `Asset.current_holder_id`.
- `Asset.status`: `'На складі'` (in stock) or `'У користуванні'` (in use).
- Assignment logs `'Передано'` for previous holder + `'Отримано'` for new holder.
- Return logs `'Повернено'`, clears `current_holder_id`, sets status to `'На складі'`.

### `component` — quantity-based consumables
- `Asset.quantity` tracks stock on hand (warehouse).
- Holder quantities are **not stored directly** — they are computed by replaying AssetLog entries in chronological order: `Видано` adds, `Повернення`/`Повернено` subtracts.
- Auto-generated serial: `component-{unix_ms}` when form serial is empty.
- Supply (restocking) logs `'Поставка'`, adds to `Asset.quantity`.
- Transfers between people log a `'Повернення'` from the source + `'Видано'` to the destination.

**Whenever you add component logic, replay logs with `defaultdict(int)`, not a direct DB field.**

---

## AssetLog Action Vocabulary

| Action (Ukrainian) | Meaning |
|---|---|
| `Створено` | Asset first created |
| `Поставка` | Component restocked |
| `Видано` | Component issued to person |
| `Повернення` | Component returned from person (or transferred away) |
| `Повернено` | Active asset returned to warehouse |
| `Передано` | Active asset transferred away from previous holder |
| `Отримано` | Active asset received by new holder |
| `Задача` | Task created |
| `Задача закрита` | Task closed |

---

## Routes Reference

| Method | URL | Handler | Description |
|---|---|---|---|
| GET | `/` | `index` | Asset list with filters, sorting, pagination |
| POST | `/add_asset` | `add_asset` | Create new asset or component |
| GET | `/asset/<id>` | `asset_detail` | Asset detail, logs, assign/return forms, tasks |
| POST | `/edit_asset/<id>` | `edit_asset` | Update asset name/serial/comments |
| POST | `/assign_asset/<id>` | `assign_asset` | Assign/transfer active; issue/transfer component |
| POST | `/return_asset/<id>` | `return_asset` | Return active to stock; return component from person |
| POST | `/add_component_supply/<id>` | `add_component_supply` | Restock component quantity |
| POST | `/add_task/<id>` | `add_task` | Add task to an active asset |
| POST | `/close_task/<id>` | `close_task` | Close a task with optional comment |
| GET | `/tasks` | `all_tasks` | Global task view with filters |
| GET | `/people` | `people` | People list with filters |
| GET | `/person/<id>` | `person_detail` | Person detail with active assets + component quantities |
| POST | `/add_person` | `add_person` | Create a person |
| GET/POST | `/edit_person/<id>` | `edit_person` | Edit person name/phone/location |
| POST | `/delete_person/<id>` | `delete_person` | Delete person (blocked if they hold assets) |
| GET | `/locations` | `locations` | Locations list |
| GET | `/location/<id>` | `location_detail` | Location detail with people, assets, components |
| POST | `/add_location` | `add_location` | Create location |
| POST | `/edit_location/<id>` | `edit_location` | Rename location |
| POST | `/delete_location/<id>` | `delete_location` | Delete location (unlinks people first) |
| POST | `/backup_database` | `backup_database` | Copy `instance/assets.db` → `backup/assets_backup_<timestamp>.db` |

---

## Key Conventions

### Database lookups
Use the helper `get_or_404(Model, id)` instead of `db.session.get()` for route handlers — it calls `abort(404)` on miss.

### Flash messages
Always use one of three categories: `'success'`, `'danger'`, `'info'`. These map to Bootstrap toast colors in `base.html`.

### Pagination
Default page size is **15** items throughout. Use SQLAlchemy's `.paginate(page=page, per_page=15, error_out=False)`.

### Sorting
Sortable columns on the asset list: `name`, `created_at`, `task_count`, `location`. The last two are done in-Python (fetch all, sort, manual paginate) because SQLAlchemy can't order by derived/related values easily. The `sort_url()` closure in `index()` toggles `asc`/`desc`.

### Custom Pagination class
When sorting in-Python the route defines an inline `Pagination` class with `.items`, `.page`, `.per_page`, `.total`, `.pages`. Templates expect these attributes.

### Timestamps
- `Asset.created_at` uses `datetime.utcnow` (UTC, no timezone).
- `AssetLog.timestamp` and `Task.created_at`/`closed_at` use `datetime.now(KYIV_TZ)` (Kyiv local time).
- Do not mix these; display formatting uses `.strftime()` directly in templates.

### Theme toggle
Stored in `localStorage` key `'theme'` (`'dark'`|`'light'`). Bootstrap 5's `data-bs-theme` attribute on `<html>` drives it. Logic is inline JS in `base.html`.

### Template structure
All templates `{% extends 'base.html' %}` and fill `{% block content %}`. The `{% block backup_button %}` in `base.html` footer is filled only by `index.html`. Pass `year=datetime.utcnow().year` from every route that renders `base.html`, otherwise the footer falls back to 2025.

### Serial numbers
- `active`: serial is optional; if provided, must be globally unique (DB unique constraint).
- `component`: if no serial provided, auto-generated as `component-{unix_ms}`.
- Empty-string serials are stored as `None` to avoid unique-constraint collisions.

---

## Common Gotchas

- **Component holder state is computed, not stored.** To find how many components a person holds, iterate all `AssetLog` entries for that asset ordered by timestamp and tally `Видано` vs `Повернення`/`Повернено`. This is done repeatedly across routes — it's an O(n logs) scan each time.
- **Location filter for components** uses the same log-replay approach but across all people in the location.
- **Deleting a person** is blocked if `Asset.current_holder_id == person.id`. Components held via logs do NOT block deletion (only active assets check).
- **`db.session.get()`** is the modern SQLAlchemy 2.x API used for lookups by primary key. Do not use deprecated `Model.query.get()`.
- **Font Awesome JS** is loaded from CDN (`cdnjs.cloudflare.com`) in `base.html` even though a local CSS + font file is also present. Both are used simultaneously.
- **`index.html` has stray `<html>/<head>/<body>` tags** at the top and bottom despite extending `base.html`. These are ignored by browsers but should not be added to other templates.

---

## Development Notes

- No automated tests. Verify changes by running the app manually.
- No database migrations. Schema changes require recreating the DB or writing raw `ALTER TABLE` SQL.
- `FLASK_SECRET_KEY` env var overrides the hardcoded dev key for flash sessions.
- `debug=True` is hardcoded in `app.run()` — do not deploy as-is.
- Backup files go to `backup/` (gitignored). The backup route copies the live SQLite file with `shutil.copy2`.
- The `instance/` folder (and thus the DB) is gitignored. Seed data must be entered manually via the UI.

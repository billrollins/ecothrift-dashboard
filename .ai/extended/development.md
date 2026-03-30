<!-- Last updated: 2026-03-30T14:30:00-05:00 -->
# Development guide (AI / contributor reference)

## Repository layout

| Path | Role |
|------|------|
| `manage.py`, `ecothrift/`, `apps/` | **Backend** — Django project + domain apps (`INSTALLED_APPS`); no separate `backend/` folder. |
| `frontend/` | **Frontend** — Vite + React; production build consumed by WhiteNoise/Heroku. |
| `printserver/` | **Local print server** — FastAPI on `127.0.0.1:8888`; build/installer here. Installed exe lives under `%LOCALAPPDATA%\EcoThrift\PrintServer\` (not source). |
| `.ai/` | AI steering: `context.md`, `protocols/`, `initiatives/`, **`extended/`** (this file and domain deep-dives). |
| `workspace/` | Local scratch, notebooks, temp artifacts, side projects — almost entirely gitignored; see `workspace/notebooks/_shared/README.md` for notebook setup. |
| `scripts/dev/` | Windows helpers to start/stop Django + Vite. |
| `scripts/deploy/` | Deploy-related helpers (e.g. commit message staging). |
| `workspace/notebooks/` | Jupyter (shared config in `_shared/`); see `workspace/notebooks/README.md` and `_shared/README.md`. |

**Root `package.json`:** Only defines `heroku-postbuild` (install + build frontend). Day-to-day Node commands run from `frontend/` (`npm run dev`, etc.).

## Prerequisites

- Python 3.12
- Node.js 20+
- PostgreSQL 15+

## First-Time Setup

```bash
# 1. Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # macOS/Linux

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Create the database
psql -U postgres -c "CREATE DATABASE ecothrift_v2 OWNER postgres;"

# 4. Run migrations
python manage.py migrate

# 5. Seed initial data (groups, admin user, registers, settings)
python manage.py setup_initial_data

# 6. Install frontend dependencies
cd frontend
npm install

# 7. Start both servers (or run scripts/dev/start_servers.bat from the repo root)
# Terminal 1:
python manage.py runserver

# Terminal 2:
cd frontend
npm run dev
```

Open `http://localhost:5173`. Login: `bill_rollins@ecothrift.us` / `JAckel13`

## Quick Scripts

If **POS registers** or **supplemental drawer** rows are missing (e.g. after `reset_business_data`), run `python manage.py setup_initial_data` to recreate defaults idempotently, or open **Admin → POS setup** (`/admin/pos-setup`, Manager/Admin) to create registers, locations, or bootstrap a supplemental drawer. You can also use Django **`/db-admin/`** (`contrib.admin`) for `Register`, `SupplementalDrawer`, and `WorkLocation`. (React app routes stay at **`/admin/*`** — e.g. `/admin/pos-setup`, `/admin/settings` — and must not collide with Django admin.) After register IDs change, re-pick the register in **POS device config** on each terminal (stored in browser localStorage). Committed scripts (drag-and-drop into a terminal or run from Explorer):

| Script | What it does |
|--------|-------------|
| `scripts/dev/start_servers.bat` | Kills listeners on 8000/5173, starts Django + Vite in new windows (uses `venv` if present) |
| `scripts/dev/kill_servers.bat` | Stops processes using ports 8000 and 5173 |
| `printserver/dev_print_label_test.bat` | Prints sample inventory labels **without** starting the print server (defaults to **Rollo Printer**). Pass `--dry-run` to write PNGs under `printserver/output/` instead. Example: `dev_print_label_test.bat --preset 3x2 --row 0` |
| `printserver/dev_print_receipt_test.bat` | Renders a sample receipt to **PNG** under `printserver/output/` (no printer). Pass `--print` to also send to Windows (uses `receipt_printer` from settings or `--printer`). Optional JSON path (same shape as POST `/print/receipt` `receipt_data`). |

**Commit message staging (for scripted commits):** write the next message in `scripts/deploy/commit_message.txt` (placeholder `---` until you replace it). See `.ai/protocols/review_bump.md`.

**Jupyter (DB1 / DB2 / DB3):** See `workspace/notebooks/_shared/README.md`. From repo root: `pip install -r workspace/notebooks/_shared/requirements-notebooks.txt` (and `jupyter` / `jupyterlab` as needed). Secrets go in gitignored `workspace/notebooks/_shared/config_local.py`.

**B-Stock notebook scraper:** Tracked package `workspace/notebooks/bstock-scraper/Scraper/` (`BStockScraper`, `python -m Scraper` from `workspace/notebooks/bstock-scraper`). API tokens and `bstock_config_local.py` live under `Scraper/` (gitignored); see `_shared/README.md`.

**Print server (V3):** AI-oriented notes in [`.ai/extended/print-server.md`](print-server.md). The Windows **installer** (`printserver/installer/setup.py`) removes legacy V2 artifacts before installing V3; optional IT batch: `printserver/installer/uninstall_legacy_prior.bat`. **Installer / S3 release version** is `VERSION` in [`printserver/config.py`](../../printserver/config.py) (not the same as repo root `.version`, which tracks the dashboard app). Build + upload: `printserver/distribute.bat`. For fast label/receipt iteration, use `printserver/dev_print_label_test.bat` and `printserver/dev_print_receipt_test.bat` (see table above).

## Dev logging (local)

- **`.ai/debug/log.config`** — Hierarchical areas (`LOG_ADD_ITEM` → `LOG_ADD_ITEM_FORM` / `LOG_ADD_ITEM_AI`, etc.). The sample in-repo sets **`LOG_ADD_ITEM = file`** so AI prompt, raw response, and form action lines append to **`.ai/debug/debug.log`** (file is gitignored).
- **`VITE_DEV_LOG=true`** in root `.env` — Required for Chrome **console** lines from `devLog` when the resolved config includes **`browser`** for that area. Restart **`npm run dev`** after changing.
- **DEBUG + staff:** `GET /api/core/dev-log/config/` returns resolved targets; `POST /api/core/dev-log/line/` appends a client line when `file` is enabled for the area.

## Environment Variables

Defined in `.env` (gitignored):

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Django secret key | (generated) |
| `DEBUG` | Debug mode | `True` |
| `ENVIRONMENT` | Runtime environment label | `development` |
| `DATABASE_NAME` | PostgreSQL database name | `ecothrift_v2` |
| `DATABASE_USER` | PostgreSQL user | `postgres` |
| `DATABASE_PASSWORD` | PostgreSQL password | `password` |
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `USE_S3` | Toggle S3-backed media storage | `False` (set `True` when using S3) |
| `AWS_ACCESS_KEY_ID` | S3 access key | — |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key | — |
| `AWS_STORAGE_BUCKET_NAME` | S3 bucket name | — |
| `AWS_S3_REGION_NAME` | S3 region | `us-east-2` |
| `ALLOWED_HOSTS` | Comma-separated hosts | `localhost,127.0.0.1` |
| `ANTHROPIC_API_KEY` | Optional AI integration key | — |
| `VITE_DEV_LOG` | Frontend dev console (`devLog`) for Add Item / suggest when `browser` is enabled in `.ai/debug/log.config` | `false` |

## Adding a New Feature

### Backend

1. Add model to the appropriate `apps/*/models.py`
2. Run `python manage.py makemigrations` + `migrate`
3. Add serializer in `apps/*/serializers.py`
4. Add ViewSet or view in `apps/*/views.py`
5. Register URL in `apps/*/urls.py`
6. Register model in `apps/*/admin.py`

### Frontend

1. Add TypeScript types in `frontend/src/types/`
2. Add API functions in `frontend/src/api/`
3. Add React Query hooks in `frontend/src/hooks/`
4. Create a **routed screen** as `frontend/src/pages/<area>/<Name>Page.tsx` (default export). Shared UI lives in `frontend/src/components/` (by feature or `layout/`, `common/`, etc.) — keep pages thin and reuse components.
5. Add route in `App.tsx`
6. Add sidebar nav item in `Sidebar.tsx` (if needed)

## Code Conventions

- **Backend:** ViewSets + DRF Routers for standard CRUD. `@action` for custom endpoints.
- **Frontend:** One API file per backend app. One hook file per domain. Pages are default exports.
- **State:** TanStack React Query for server state. React Context for auth only. No Redux.
- **Forms:** React Hook Form for complex forms. Controlled inputs for simple ones.
- **Tables:** MUI X DataGrid for all data tables. `pageSizeOptions={[10, 25, 50, 100]}`.
- **Notifications:** `useSnackbar()` from notistack for success/error toasts.

## Deployment (Heroku)

```bash
# Procfile handles:
#   release: python manage.py migrate && python manage.py create_cache_table
#   web: gunicorn ecothrift.wsgi --log-file - --timeout 120

# Root package.json heroku-postbuild script builds the frontend
# WhiteNoise serves static files from frontend/dist/
# Production settings: ecothrift/settings_production.py
```

Set `DJANGO_SETTINGS_MODULE=ecothrift.settings_production` on Heroku.

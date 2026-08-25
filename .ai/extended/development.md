<!-- Last updated: 2026-08-25 (STAFF_DASHBOARD_HOST for staff reset links) -->
# Development guide (AI / contributor reference)

## Repository layout

| Path | Role |
|------|------|
| `manage.py`, `ecothrift/`, `apps/` | **Backend** — Django project + domain apps (`INSTALLED_APPS`), including **`buying/`** (B-Stock auction intelligence); no separate `backend/` folder. |
| `frontend/` | **Frontend** — Vite + React; production build consumed by WhiteNoise/Heroku. |
| `printserver/` | **Local print server** — FastAPI on `127.0.0.1:8888`; build/installer here. Installed exe lives under `%LOCALAPPDATA%\EcoThrift\PrintServer\` (not source). |
| `.ai/` | AI steering: `context.md`, `protocols/`, `initiatives/`, **`extended/`** (this file and domain deep-dives). |
| `workspace/` | Local scratch, notebooks, temp artifacts — almost entirely gitignored; generated CSV/JSON under **`workspace/data/`** is not tracked (only **`.gitkeep`**). Jupyter setup is below. |
| `scripts/dev/` | Windows helpers — `start_all.bat` (Django + staff + public), plus `start_dashboard.bat`, `start_mobile_dashboard.bat`, `start_website.bat`. |
| `scripts/deploy/` | Deploy-related helpers (e.g. commit message staging). |
| `workspace/notebooks/` | Jupyter — tracked **`.ipynb`**, **`.py`**, **`_shared/config.example.py`**, **`requirements-notebooks.txt`**, category-research **`taxonomy_v1.example.json`**, **`docs/taxonomy_input_schema.md`**, **`discovery_lockin.example.md`**, SQL under **`ai_scripts/sql/`**. |

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
psql -U postgres -c "CREATE DATABASE ecothrift_v3 OWNER postgres;"

# 4. Run migrations
python manage.py migrate

# 5. Seed initial data (groups, admin user, registers, settings)
python manage.py setup_initial_data

# 6. Install frontend dependencies
cd frontend
npm install

# 7. Start dev servers (or run scripts/dev/start_dashboard.bat or start_website.bat from the repo root)
# Terminal 1:
python manage.py runserver

# Terminal 2:
cd frontend
npm run dev
```

## Heroku Scheduler (buying)

| Schedule | Command |
|----------|---------|
| Daily (e.g. 03:00 UTC) | `python manage.py compute_daily_category_stats` |
| Hourly | `python manage.py scheduled_sweep` |

`compute_daily_category_stats` refreshes SQL-backed `CategoryStats` (including `need_score_1to99`), invalidates the category-need cache, and (unless `--skip-recompute-open`) runs a full valuation pass for non-archived open/closing auctions with a future `end_time`. `scheduled_sweep` runs discovery then `recompute_active_auctions_lightweight`. **Removed:** the legacy nightly **`recompute_cost_pipeline`** — item costs use **`PurchaseOrder.est_shrink`** and **`recompute_all_item_costs`** for backfills only.

## Heroku Scheduler (Online Sales)

| Schedule | Command |
|----------|---------|
| Every 10–15 minutes | `python manage.py expire_online_holds` |
| Daily (e.g. 08:00 UTC) | `python manage.py archive_online_sales` |

`expire_online_holds` releases reserved quantity for active holds past `expires_at` (`pending_verification` / provisional through today's close, verified `requested`/`confirmed`/`ready_for_pickup` through the 3-open-day window). Staff inaction never expires a verified hold. It also deletes unverified inquiry conversations older than `ONLINE_SALES_INQUIRY_VERIFY_HOURS` (default 24). Use `--dry-run` to count only. Seed hours once with `python manage.py seed_online_sales_hours` (AppSetting key `online_sales.hours`).

`archive_online_sales` ages finished work out of the staff queues. It stamps `archived_at` on released holds and resolved threads past their window — reversible, invisible to customers, and it never changes a status or touches reserved stock. Windows come from `apps/webstore/services/retention.py`: `ONLINE_SALES_ARCHIVE_RELEASED_DAYS` (30), `ONLINE_SALES_ARCHIVE_RESOLVED_DAYS` (30), `ONLINE_SALES_PURGE_ABANDONED_DAYS` (30), `ONLINE_SALES_CUSTOMER_HISTORY_DAYS` (90, customer-facing view only).

**Deletion is opt-in.** Plain runs never delete; they print how many holds are purge-eligible. `--purge` deletes holds that were abandoned before the customer proved their email — released status, no `verified` event, no confirmed `HoldConfirmation`, no customer message, no POS cart — plus their thread when it holds only system messages. Completed sales are never eligible at any age. **Roll it out as `--dry-run` first**, watch the counts for a week, then drop `--dry-run`, and only add `--purge` once the eligible count looks right.

`ONLINE_SALES_REQUEST_TRIAGE_HOURS` and `ONLINE_SALES_VERIFY_MINUTES` are deprecated; provisional holds use store close + `ONLINE_SALES_PROVISIONAL_GRACE_MINUTES`.

**Prod flags (v2.69.0 go-live):** `ONLINE_SALES_ENABLED=true` and `MS_GRAPH_ENABLED=true` on Heroku after purge/seed/smoke. Staff Online Sales pages remain available to Manager/Admin regardless of the public kill switch. Other flags: `ONLINE_SALES_INQUIRIES_ENABLED`, `ONLINE_SALES_ACCOUNTS_ENABLED`, `ONLINE_SALES_PUBLIC_BASE_URL` (magic-link / hold email links). Whole-DB wipe commands (`reset_business_data`, `reset_buying_data`) were removed - Online Sales blank-slate is `purge_online_sales` only (`--force-production --yes` on prod).

## Heroku Scheduler (Microsoft Graph mailbox)

| Schedule | Command |
|----------|---------|
| Every 10 minutes (Scheduler minimum) | `python manage.py sync_ms_mailbox` |

Requires `MS_GRAPH_ENABLED=true` plus the `MS_GRAPH_*` keys below. Manual refresh: Admin **Retail inbox** → Refresh now, or `POST /api/mailbox/sync/`.

**Send/receive mailbox:** `retail@ecothrift.us` via Microsoft Graph client credentials. From: `Eco-Thrift <retail@ecothrift.us>`. Reply-To: `retail@ecothrift.us`. Magic-link and hold emails embed `ONLINE_SALES_PUBLIC_BASE_URL` (local: `http://localhost:5174`). There is no debug-token bypass — confirming an email always means clicking the emailed link. With `MS_GRAPH_ENABLED=false`, the console backend prints the message (link included) to the Django terminal. Graph send does not require an SPF change.

**Entra app (do not grant org-wide Graph mail permissions):** single-tenant app registration + client secret. Record tenant ID, application (client) ID, and the **Enterprise Application** (service principal) object ID — not the app-registration object ID. Do **not** add application permissions `Mail.Read` / `Mail.ReadWrite` / `Mail.Send` and do **not** grant tenant-wide admin consent for those scopes.

**Restrict to retail@ with Exchange Online RBAC** (Application Mail.Send / Application Mail.ReadWrite, scoped to `retail@ecothrift.us`):

```powershell
Connect-ExchangeOnline
New-ServicePrincipal -AppId "<CLIENT_ID>" -ObjectId "<ENTERPRISE_APPLICATION_OBJECT_ID>" -DisplayName "Eco-Thrift Dashboard Graph Mail"
New-ManagementScope -Name "Eco-Thrift retail mailbox" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'retail@ecothrift.us'"
New-ManagementRoleAssignment -Name "Eco-Thrift retail Mail.ReadWrite" -Role "Application Mail.ReadWrite" -App "<ENTERPRISE_APPLICATION_OBJECT_ID>" -CustomResourceScope "Eco-Thrift retail mailbox"
New-ManagementRoleAssignment -Name "Eco-Thrift retail Mail.Send" -Role "Application Mail.Send" -App "<ENTERPRISE_APPLICATION_OBJECT_ID>" -CustomResourceScope "Eco-Thrift retail mailbox"
Test-ServicePrincipalAuthorization -Identity "<ENTERPRISE_APPLICATION_OBJECT_ID>" -Resource "retail@ecothrift.us"
```

RBAC can take time to propagate. Verify with `python manage.py check_ms_graph` (optional `--to`), then `python manage.py sync_ms_mailbox` (stores the Graph delta cursor; safe to rerun). Disable immediately with `MS_GRAPH_ENABLED=false`.

**SPF:** if a transactional send provider is added later, **append** its `include:` to the existing SPF TXT — never replace Microsoft's `include:spf.protection.outlook.com`.

**Inventory / Item Processor:** optional safety net for `ProcessingRow.search_string` (bulk/SQL paths that bypass ORM `save()`): e.g. weekly `python manage.py rebuild_processing_search_string` (defaults to excluding `complete`/`cancelled` POs; add `--dry-run` to count rows only).

**Also polled in-app (not necessarily the same Heroku clock):** **`watch_auctions`** updates watchlisted auctions via anonymous batch GET (`auction.bstock.com`) when **`WatchlistEntry`** poll intervals allow — run it yourself or wire a scheduler.

**Local buying parity (manual):** from the repo root with `venv` active, run in order: `python manage.py compute_daily_category_stats` → `python manage.py scheduled_sweep` → `python manage.py watch_auctions`. Not included: **`recompute_all_item_costs`** (on-demand backfill after data fixes, not daily).

## Backend tests

- Run Django tests: `python manage.py test` (uses your configured database; creates a test DB).
- If PostgreSQL test DB / schema setup fails locally, POS tests can run against SQLite in-memory: `python manage.py test apps.pos.tests --settings=ecothrift.test_settings` (see [`ecothrift/test_settings.py`](../../ecothrift/test_settings.py)).

Open `http://localhost:5173`. Login: `bill_rollins@ecothrift.us` / `JAckel13`

## Quick Scripts

If **POS registers** or **supplemental drawer** rows are missing, run `python manage.py setup_initial_data` to recreate defaults idempotently, or open **Admin → POS setup** (`/admin/pos-setup`, Manager/Admin) to create registers, locations, or bootstrap a supplemental drawer. **Inventory assumptions** (e.g. default **`po_default_est_shrink`** for new POs): **Admin → Assumptions** (`/admin/assumptions`, Manager/Admin); keys are **`AppSetting`** rows — see **`.ai/extended/backend.md`** (*Item acquisition cost*). You can also use Django **`/db-admin/`** (`contrib.admin`) for `Register`, `SupplementalDrawer`, and `WorkLocation`. (React app routes stay at **`/admin/*`** — e.g. `/admin/pos-setup`, `/admin/settings`, `/admin/assumptions` — and must not collide with Django admin.) After register IDs change, re-pick the register in **POS device config** on each terminal (stored in browser localStorage). Committed scripts (drag-and-drop into a terminal or run from Explorer):

| Script | What it does |
|--------|-------------|
| `scripts/dev/start_all.bat` | **Full stack:** Django + staff Vite (LAN HTTPS by default) + public site (8000 / 5173 / 5174). |
| `scripts/dev/start_dashboard.bat` | **Staff only, localhost HTTP:** Django + staff Vite (8000 / 5173). No www, no phone/LAN HTTPS. |
| `scripts/dev/start_mobile_dashboard.bat` | **Staff on LAN HTTPS:** Django + staff Vite bound for a phone on the same Wi-Fi. No www. |
| `scripts/dev/start_website.bat` | **Public only (www):** Django + `frontend-public` (8000 / 5174). |
| `python scripts/data/extract_po_descriptions.py` (if present locally) | **Historical sell-through —** reads POs from local **ecothrift_v1** / **ecothrift_v2** / **ecothrift_v3**; writes CSV under **`workspace/data/`** (**`CHANGELOG`** **2.7.1**). Requires **`psycopg2`** and root **`.env`** DB vars. |
| `printserver/dev_print_label_test.bat` | Prints sample inventory labels **without** starting the print server (defaults to **Rollo Printer**). Pass `--dry-run` to write PNGs under `printserver/output/` instead. Example: `dev_print_label_test.bat --preset 3x2 --row 0` |
| `printserver/dev_print_receipt_test.bat` | Renders a sample receipt to **PNG** under `printserver/output/` (no printer). Pass `--print` to also send to Windows (uses `receipt_printer` from settings or `--printer`). Optional JSON path (same shape as POST `/print/receipt` `receipt_data`). |

**Commit message staging (for scripted commits):** write the next message in `scripts/deploy/commit_message.txt` (placeholder `---` until you replace it). See `.ai/protocols/ship.md`.

**Jupyter (DB1 / DB2 / DB3):** From repo root: `pip install -r workspace/notebooks/_shared/requirements-notebooks.txt` (and `jupyter` / `jupyterlab` as needed). Copy **`workspace/notebooks/_shared/config.example.py`** → **`config_local.py`** (gitignored) for multi-DB connection dicts aligned with root **`.env`**.

**B-Stock (production):** **`apps/buying/`** — `python manage.py sweep_auctions`, **`bstock_token`** (writes **`workspace/.bstock_token`**, gitignored; scraper prefers it over **`BSTOCK_AUTH_TOKEN`**). **`BUYING_REQUEST_DELAY_SECONDS`**, **`BSTOCK_MAX_RETRIES`**, **`BSTOCK_SEARCH_MAX_PAGES`** in root `.env`. **Manifests:** staff **CSV upload** in the React UI (`upload_manifest`); there is no order-process manifest download or `pull_manifests*` commands. Search listings POST is unauthenticated. Bookmarklet to copy JWT from the `elt` cookie: **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`**. Optional notebook exploration: **`workspace/notebooks/category-research/`**, **`workspace/notebooks/historical-data/`**, **`workspace/notebooks/bstock-scraper/Scraper/`** (package + **`examples/bstock_quickstart.ipynb`**). **AI usage log (all Claude call sites):** append-only **`workspace/logs/ai_usage.jsonl`** (gitignored); inspect directly or aggregate with your own tooling (**`scripts/ai/summarize_ai_usage.*`** is not in the repo).

**Print server (V3):** AI-oriented notes in [`.ai/extended/print-server.md`](print-server.md). The Windows **installer** (`printserver/installer/setup.py`) removes legacy V2 artifacts before installing V3; optional IT batch: `printserver/installer/uninstall_legacy_prior.bat`. **Installer / S3 release version** is `VERSION` in [`printserver/config.py`](../../printserver/config.py) (not the same as repo root `.version`, which tracks the dashboard app). Build + upload: `printserver/distribute.bat`. For fast label/receipt iteration, use `printserver/dev_print_label_test.bat` and `printserver/dev_print_receipt_test.bat` (see table above).

## Dev logging (local)

- **Dev logging** — Django **`LOGGING`** in settings; optional **`VITE_DEV_LOG`** for frontend **`devLog`**. (Legacy **`.ai/debug/`** tree removed; configure locally if you need hierarchical file logs.)
- **`VITE_DEV_LOG=true`** in root `.env` — Required for Chrome **console** lines from `devLog` when the resolved config includes **`browser`** for that area. Restart **`npm run dev`** after changing.
- **DEBUG + staff:** `GET /api/core/dev-log/config/` returns resolved targets; `POST /api/core/dev-log/line/` appends a client line when `file` is enabled for the area.

## Environment Variables

Defined in `.env` (gitignored):

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Django secret key | (generated) |
| `DEBUG` | Debug mode | `True` |
| `ENVIRONMENT` | Runtime environment label | `development` |
| `DATABASE_NAME` | PostgreSQL database name | `ecothrift_v3` |
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
| `ANTHROPIC_API_KEY` | Anthropic API key (used when a model id is `claude-*`) | — |
| `XAI_API_KEY` | xAI Grok API key (**`GROK_API_KEY`** is an alias; used for `grok-*` ids) | — |
| `GOOGLE_API_KEY` | Google Gemini API key (**`GEMINI_API_KEY`** is an alias; used for `gemini-*` ids) | — |
| `XAI_API_BASE` | OpenAI-compatible base URL for Grok | `https://api.x.ai/v1` |
| `AI_PROVIDER` | `auto` (route by model id: `grok*` → xAI, `gemini*` → Google, else Anthropic), or force `anthropic` / `xai` / `google` | `auto` |
| `AI_MODEL` / `AI_MODEL_FAST` | Base fallback model ids (`ecothrift/settings.py`) | see `settings.py` |
| `AI_MODEL_<PURPOSE>` | Per-feature model id (e.g. `AI_MODEL_SUGGEST_ITEM`, `AI_MODEL_INVENTORY_CLEANUP`); **any provider's id works for every purpose** — all call sites route via `apps/core/services/llm_router.py` | falls back to `AI_MODEL` / `AI_MODEL_FAST` |
| `AI_PRICING` | Defined in **`ecothrift/settings.py`** (per-model input/output/cache rates) — not env; costs logged to **`workspace/logs/ai_usage.jsonl`** | — |
| `VITE_DEV_LOG` | Frontend dev console (`devLog`) for Add Item / suggest | `false` |
| `BSTOCK_AUTH_TOKEN` | Fallback JWT if `workspace/.bstock_token` is missing (from `python manage.py bstock_token` or DevTools) | — |
| `BUYING_REQUEST_DELAY_SECONDS` | Minimum delay between scraper HTTP requests | `2.0` |
| `BSTOCK_MAX_RETRIES` | Retries after HTTP 429 | `3` |
| `BSTOCK_SEARCH_MAX_PAGES` | Safety cap on search pagination pages per marketplace | `5000` |
| `BUYING_SOCKS5_PROXY_ENABLED` | Route all `*.bstock.com` HTTP through SOCKS5 | `False` |
| `BUYING_SOCKS5_LOCAL_DNS` | `True` = `socks5://` (recommended for PIA); `False` = `socks5h://` | `True` |
| `BUYING_SOCKS5_DEV_AUDIT` | Log redacted SOCKS URLs + egress IP probes to `logs/bstock_api.log` | `False` |
| `PUBLIC_SITE_HOSTS` | Comma-separated hosts that get the public storefront SPA (empty = middleware inactive) | `''` locally; prod `ecothrift.us,www.ecothrift.us` |
| `PUBLIC_SITE_CANONICAL_HOST` | Apex host for www→apex 301 | `ecothrift.us` |
| `ONLINE_SALES_ENABLED` | Kill switch for public catalog/holds (staff workspace stays) | `False` |
| `ONLINE_SALES_INQUIRIES_ENABLED` | Allow "Ask about this item" without a hold | `True` |
| `ONLINE_SALES_ACCOUNTS_ENABLED` | Magic-link customer accounts | `True` |
| `ONLINE_SALES_PUBLIC_BASE_URL` | Absolute origin used in emailed magic/hold links | `https://ecothrift.us` |
| `STAFF_DASHBOARD_HOST` | Host in emailed **staff** password-reset links (localhost gets `http://`) | `dash.ecothrift.us` |
| `DEFAULT_FROM_EMAIL` | `From` for Django's own senders | `Eco-Thrift <retail@ecothrift.us>` |
| `ONLINE_SALES_EMAIL_FROM` | SMTP/`From` address for transactional mail | `retail@ecothrift.us` |
| `ONLINE_SALES_EMAIL_DISPLAY_NAME` | Display name on transactional mail | `Eco-Thrift` |
| `ONLINE_SALES_EMAIL_REPLY_TO` | Reply-To on transactional mail | `retail@ecothrift.us` |
| `ONLINE_SALES_PROVISIONAL_GRACE_MINUTES` | Minutes to verify a new hold before it expires | `30` |
| `ONLINE_SALES_INQUIRY_VERIFY_HOURS` | Hours to verify an inquiry thread before cleanup | `24` |
| `ONLINE_SALES_ARCHIVE_RELEASED_DAYS` | Days before released holds auto-archive from staff queues | `30` |
| `ONLINE_SALES_ARCHIVE_RESOLVED_DAYS` | Days before resolved threads auto-archive | `30` |
| `ONLINE_SALES_PURGE_ABANDONED_DAYS` | Days before never-verified abandoned holds are eligible for `--purge` | `30` |
| `ONLINE_SALES_CUSTOMER_HISTORY_DAYS` | Default customer History window for ended holds | `90` |
| `MS_GRAPH_ENABLED` | Send mail via Microsoft Graph (else console/fallback backend) | `False` |
| `MS_GRAPH_TENANT_ID` | Entra tenant id | `''` |
| `MS_GRAPH_CLIENT_ID` | App registration client id | `''` |
| `MS_GRAPH_CLIENT_SECRET` | App registration client secret | `''` |
| `MS_GRAPH_MAILBOX` | Mailbox Graph sends as / syncs from | `retail@ecothrift.us` |
| `MS_GRAPH_FALLBACK_EMAIL_BACKEND` | Backend used when Graph is off or fails open | Django console |
| `EMAIL_BACKEND` | Override Django email backend (defaults from `MS_GRAPH_ENABLED`) | auto |
| `DJANGO_SETTINGS_MODULE` | Settings module (**required on Heroku**) | `ecothrift.settings` locally; prod `ecothrift.settings_production` |

**Full SOCKS5 setup (all `BUYING_SOCKS5_*` vars):** See **[`.ai/extended/vpn-socks5.md`](vpn-socks5.md)**.

**PostgreSQL schemas (local):** `DATABASE_*` points at **one** database (typically `ecothrift_v3`). Django sets `search_path=ecothrift` so models use **`ecothrift.*`**. The **`public`** schema in the same database may hold legacy/V2 data; category-bin exports query **`public.*`** and **`ecothrift.*`** with explicit names. **`scripts/deploy/0_pull_prod_to_local.bat`** is the one action for fresh prod data: it stops whatever is on ports 8000 / 5173 / 5174, replaces **schema `ecothrift` only** (not `public` / `darkhorse`), then `migrate`s whatever this checkout has that production has not. It does not start servers again. Timestamped dumps live in **`scripts/deploy/backups/`** (gitignored). Full off-box backup of every schema is **`1_backup_prod.bat`**. See the **Environment Variables** table above. Separate local archives **`ecothrift_v1`** (V1) and **`ecothrift_v2`** (V2 **`public`** only) are optional for historical tooling; see **`.ai/extended/databases.md`**.

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
#   release: python manage.py migrate && python manage.py createcachetable
#   web: gunicorn ecothrift.wsgi --log-file - --timeout 120

# Root package.json heroku-postbuild script builds the frontend
# WhiteNoise serves static files from frontend/dist/
# Production settings: ecothrift/settings_production.py
```

Set `DJANGO_SETTINGS_MODULE=ecothrift.settings_production` on Heroku.

**Post-release one-shot (when CHANGELOG calls for it, e.g. v2.16.0):** after deploy + migrate, run **`python manage.py recompute_all_item_costs`** in a one-off Heroku shell or release task if you need every **`Item.cost`** refreshed from the PO shrink formula (`PurchaseOrder.compute_item_cost`). Not in **`release:`** in Procfile by default — run manually. See **`CHANGELOG`** **[2.16.0]** Operations.

<!-- Last updated: 2026-04-07T23:00:00-05:00 -->
# Changelog

All notable changes to this project are documented here at the **version level**.
Commit-level detail belongs in commit messages, not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Steering

- **Initiatives — category intelligence completed:** [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md) — Phases 0–7 delivered (2026-04-06); actionable buying recommendations; onboarding [`workspace/notebooks/category-research/README.md`](workspace/notebooks/category-research/README.md). Active initiatives table cleared in [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md). Protocols: [`.ai/initiatives/_protocols/move_initiative_to_completed.md`](.ai/initiatives/_protocols/move_initiative_to_completed.md), [`.ai/protocols/review_bump.md`](.ai/protocols/review_bump.md).

### Changed

- **Category research layout:** Artifacts moved from **`workspace/testing/Category Research/`** to **`workspace/notebooks/category-research/`** (`exports/`, **`logs/`** with `extraction_runs.log` and **`logs/categorization/`** for AI JSONL, `categorized_exports/`, `reports/`, `model_compare/`). Canonical paths in **`apps/inventory/category_research_paths.py`**. Taxonomy files: **`taxonomy_v1.example.json`**, **`docs/taxonomy_input_schema.md`**.

### Added

- **Category research — unified notebook extracts:** SQL [`scripts/sql/unified_bin1_public.sql`](scripts/sql/unified_bin1_public.sql), [`unified_bin2_public.sql`](scripts/sql/unified_bin2_public.sql), [`unified_bin3_public.sql`](scripts/sql/unified_bin3_public.sql) (identical columns + `vendor_name`; Bin 3 via ecothrift retag notes; PO table `public.inventory_purchase_order`); discovery SQL [`workspace/notebooks/category-research/ai_scripts/sql/category_research_discovery.sql`](workspace/notebooks/category-research/ai_scripts/sql/category_research_discovery.sql) with runner [`ai_execute_sql.py`](workspace/notebooks/category-research/ai_scripts/ai_execute_sql.py) → `ai_scripts/output/*.csv` (gitignored); pointer [`scripts/sql/category_research_discovery.sql`](scripts/sql/category_research_discovery.sql); package [`workspace/notebooks/category-research/cr/`](workspace/notebooks/category-research/cr/) and [`category_research.ipynb`](workspace/notebooks/category-research/category_research.ipynb).

### Steering

- **Initiatives — lifecycle protocols:** [`.ai/initiatives/_archived/_protocols/README.md`](.ai/initiatives/_archived/_protocols/README.md) — `activate_initiative`, `move_initiative_to_pending`, `_backlog`, `_completed`, `_abandoned`; [`.ai/protocols/move_to_pending.md`](.ai/protocols/move_to_pending.md) stubs to `move_initiative_to_pending.md`.
- **Initiatives:** Location label initiative moved to **pending** — [`.ai/initiatives/_archived/_pending/create_location_label.md`](.ai/initiatives/_archived/_pending/create_location_label.md) (off the active index; resume when product/UI integration for location labels is in scope).
- **Initiatives:** Print server — receipt format moved to **pending** — [`.ai/initiatives/_archived/_pending/print_server_receipt_format.md`](.ai/initiatives/_archived/_pending/print_server_receipt_format.md) (off the active index pre-production; resume for POS/plain-text or PNG/thermal parity). Reference shipped in-repo: `RECEIPT_RENDER_SCALE` / `render_receipt_to_image`, default queue **Receipt Printer**, workspace GDI receipt scripts under `workspace/receipt_printer/`.

### Dashboard (dev tooling)

- **Add Item dev logging:** Hierarchical **`.ai/debug/log.config`** areas **`LOG_ADD_ITEM`**, **`LOG_ADD_ITEM_FORM`**, **`LOG_ADD_ITEM_AI`**; default committed config sets **`LOG_ADD_ITEM = file`** so AI prompt, raw response, and form action lines go to **`.ai/debug/debug.log`**. Endpoints **`GET /api/core/dev-log/config/`**, **`POST /api/core/dev-log/line/`** (DEBUG, staff). Frontend **`useDevLogConfig`**, **`ItemForm`** instrumentation. Initiative (completed): [`.ai/initiatives/_archived/_completed/add_item_dialog_and_sources.md`](.ai/initiatives/_archived/_completed/add_item_dialog_and_sources.md).

### Print server (source — ship via `printserver/distribute.bat`; **dashboard Heroku not bumped**)

- **Labels:** “Concept C” side stripe — ⅓ price+QR column (50/50 black/QR), ⅔ copy+logo; unified 3×2 / 1.5×1 layout; price stack (`$` / dollars with thousands commas / cents); **sub-dollar** amounts (`$0.75`, etc.): **`$` + cents only** (no middle `0`); **dollar digits** left-aligned with extra inset when whole dollars > 0; **v1.2.37+:** smaller **$**, larger dollar line and cents; **v1.2.38+:** `big_base` by digit count for long prices at scale 1.0; price fit search **1.0 → 0.5** step **0.01**; optional `price_fit_stats` on `generate_label`; GDI **`send_image`** fit to printable rect, center X, top Y (thermal alignment).
- **Version:** `printserver/config.py` **1.2.38** (see `printserver/CHANGELOG.md`).
- **Dev:** `printserver/dev_print_e2e_3_labels.bat` — first three rows from `workspace/testing/data/retag_e2e_10_items.json`. **`printserver/scripts/label_price_fringe_grid.py`** — fringe-case PNGs + fit summary to `printserver/output_label_fringe_review/` (gitignored).
- **Samples:** `label_test_data.py` prices `$1.99`, `$25.00`, `$1,123.75`; consultant notes under `.ai/reference/Consult Label/to-be-checked/`.
- **Steering:** Label price layout work archived — [`.ai/initiatives/_archived/_completed/print_server_label_price_layout.md`](.ai/initiatives/_archived/_completed/print_server_label_price_layout.md) (print server **v1.2.35–v1.2.38**); see [`.ai/initiatives/_archived/ARCHIVE.md`](.ai/initiatives/_archived/ARCHIVE.md).

---

## [2.4.0] — 2026-04-07

### Added

- **Buying / B-Stock (Phase 1 complete):** Django app **`apps/buying/`** with models, services (**`scraper`**, **`pipeline`**, **`normalize`**), management commands **`sweep_auctions`**, **`pull_manifests`**, **`bstock_token`**; **`POST /api/buying/token/`** (DEBUG or localhost) writes **`workspace/.bstock_token`**; rejects JWE cookie tokens (`eyJhbGciOiJSU0EtT0FF`). **`scripts/refresh_bstock.bat`**. Bookmarklet and docs: **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`**. Notebook workbench: **`workspace/notebooks/bstock-intelligence/README.md`**. Initiative: [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md).

### Changed

- **Buying / B-Stock scraper:** Microservice URLs (`search.bstock.com`, `auction.bstock.com`, `listing.bstock.com`, `order-process.bstock.com`, `shipment.bstock.com`). Settings: **`BSTOCK_AUTH_TOKEN`**, **`BUYING_REQUEST_DELAY_SECONDS`**, **`BSTOCK_MAX_RETRIES`**, **`BSTOCK_SEARCH_MAX_PAGES`**. **`DEBUG`** CORS adds **`https://bstock.com`** / **`https://www.bstock.com`** for bookmarklet **`fetch`**. **`get_manifest`**: **`limit`** capped at **1000** per request; paginates with **`offset`** until **`total`** rows. Search listing mapping: **`categories`**, **`winningBidAmount`**, **`numberOfBids`**, **`auctionUrl`**, **`has_manifest`** when **`lotId`** is set; **`merge_auction_state_into_fields`** fills **`startPrice`**, **`buyNow.price`**, **`winningBidAmount`**; money helper treats integers **>= 10000** as cents.

- **Docs / env:** **`.env.example`**, **`.ai/extended/backend.md`**, **`.ai/extended/development.md`**, **`.ai/context.md`**, **`README.md`**, **`workspace/notebooks/README.md`**, **`workspace/notebooks/_shared/README.md`**, **`.ai/initiatives/_index.md`** (B-Stock row).

### Baseline (release verification)

- **`python manage.py sweep_auctions`:** **97** listing rows upserted across **6** active marketplaces (full pagination run).
- **`python manage.py pull_manifests`:** ran; **0** new manifest rows written in this run (existing rows already present for eligible auctions).
- **Postgres snapshot after sweep:** **98** `Auction` rows, **67,276** `ManifestRow` rows (cumulative across this and prior sessions).

---

## [2.3.0] — 2026-04-07

### Added

- **Buying / B-Stock (Phase 1):** New Django app **`apps/buying/`** for auction intelligence: models `Marketplace`, `Auction`, `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`; server-side services **`discover_auctions`**, **`get_auction_detail`**, **`get_manifest`** (manifest URL optional until DevTools capture); **`python manage.py sweep_auctions`** and **`python manage.py pull_manifests`**; Postgres-backed persistence; Django admin registration. Configuration via **`BSTOCK_*`** and **`BUYING_REQUEST_DELAY_SECONDS`** in `.env` (see **`.env.example`**). Explicit **`requests`** dependency in **`requirements.txt`**. Notebook workbench: **`workspace/notebooks/bstock-intelligence/README.md`**. Initiative: [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md).

---

## [2.2.10] — 2026-04-07

### Changed

- **Category research — single-database exports:** **`export_category_bins`** uses Django’s **`default`** connection only. Bins 1–2 run schema-qualified SQL against **`public.*`** (V2-era inventory/POS); Bin 3 uses **`ecothrift.*`**. Removed optional **`DATABASES['legacy']`** / **`CATEGORY_LEGACY_DATABASE_NAME`** from settings — one Postgres database can hold both schemas. SQL script headers and **`workspace/testing/Category Research/`** docs updated accordingly. Initiative (now archived): [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md).

---

## [2.2.9] — 2026-04-06

### Added

- **POS — unscannable (pink tag) line:** **`POST /api/pos/carts/{id}/add-manual-line/`** adds a cart line **without** an inventory item (`item` null): `description` (required), optional `unit_price` (default **0.50**), optional `quantity` (default 1). Rejects non-open carts. No `ItemScanHistory` row. Terminal: **Unscannable item** button, dialog (defaults **Pink Tag Item** / **0.50**), description field selected on open, **OK** / Enter submits; cart lines show a **Pink tag** chip when `item` is null. Tests: `apps/pos/tests/test_cart_manual_line.py`. Initiative: [`.ai/initiatives/_archived/_completed/pos_unscannable_manual_line.md`](.ai/initiatives/_archived/_completed/pos_unscannable_manual_line.md).

---

## [2.2.8] — 2026-04-06

### Added

- **POS — sold SKU and resale copy:** Scanning a sold unit returns structured errors (`ITEM_ALREADY_SOLD`, `sku`, `title`). **`ItemScanHistory`** extended with `outcome`, optional `cart` and `created_by`; blocked scans log `pos_blocked_sold`. **`POST /api/pos/carts/{id}/add-resale-copy/`** atomically duplicates a sold item for resale ([`apps/inventory/services/resale_duplicate.py`](apps/inventory/services/resale_duplicate.py)) and adds a line with **`resale_source_sku`** / **`resale_source_item_id`** for staff reporting. Terminal: modal (**Cancel** vs **Create copy and add to cart**). Transactions detail (`/pos/transactions`) shows a staff-only resale caption; printed receipts use normal line **description** only (no internal provenance on the customer copy). Tests: `apps/pos/tests/test_cart_add_item_audit.py`, `test_cart_add_resale_copy.py`. Initiative: [`.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md`](.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md).

### Deployment

- **Migrations:** apply `inventory` (ItemScanHistory) and `pos` (CartLine resale columns): `python manage.py migrate`.

---

## [2.2.7] — 2026-04-06

### Fixed

- **POS — cart totals:** `Cart.recalculate()` now sums line totals from the database instead of `cart.lines.all()`, which could reuse a stale `prefetch_related` cache after `add-item` or line edits so header/footer totals lagged line rows. Regression tests: `apps/pos/tests/test_cart_totals.py`. Initiative: [`.ai/initiatives/pos_cart_total_stale_prefetch_bug.md`](.ai/initiatives/pos_cart_total_stale_prefetch_bug.md). For local runs without a PostgreSQL test database, use `python manage.py test apps.pos.tests --settings=ecothrift.test_settings` (SQLite in-memory via [`ecothrift/test_settings.py`](ecothrift/test_settings.py)).

- **Routing — Django admin vs React `/admin/*`:** Django **`contrib.admin`** moved from **`/admin/`** to **`/db-admin/`** so hard refresh and direct URLs to in-app pages (e.g. **`/admin/settings`**, **`/admin/users`**) load the React SPA instead of Django’s admin login. Production SPA fallback no longer excludes **`admin/`**; Vite dev proxy targets **`/db-admin`** only. Exact **`/admin`** / **`/admin/`** redirects to **`/db-admin/`** for bookmarks to the old Django admin root. Superusers who used Django Admin at **`/admin/`** should open **`/db-admin/`**. Initiative (archived completed): [`.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md`](.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md).

---

## [2.2.6] — 2026-03-31

### Changed

- **Inventory — Retag:** After a successful multi-unit tag (**Labels / qty** > 1), the qty control resets to **1** for the next scan. **Outside initiative** — UX polish (`RetagPage.tsx`).

---

## [2.2.5] — 2026-03-31

### Added

- **Inventory — Retag:** **Labels / qty** (1–50) on **`/inventory/retag`** creates that many new DB3 items (unique SKUs, one `RetagLog` per unit) per scan or manual confirm. **`POST /api/inventory/retag/v2/create/`** accepts optional **`quantity`** (default 1) and returns **`created`** (per-item `new_sku` + `print_payload`). The browser prints each label with the existing local print server **`POST /print/label`** only, staggered **200 ms** between jobs (no new print-server routes).

---

## [2.2.4] — 2026-03-28

### Fixed

- **Layout — sidebar:** Prevent horizontal scrollbars in the left nav: drawer paper and scroll region use **`overflow-x: hidden`**; nav list is full-width with **`minWidth: 0`**; long labels **ellipsis**; section chevrons and icons **`flexShrink: 0`**. **Outside initiative** — UI polish only (`MainLayout.tsx`, `Sidebar.tsx`).

---

## [2.2.3] — 2026-03-28

### Added

- **Inventory — Item detail:** After **Save**, if **price**, **title**, or **brand** changed, a **non-blocking warning banner** (fade + auto-dismiss) recommends **reprinting the label**, with a **Reprint label** action. Initiative closure: [`.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md).

### Changed

- **Inventory — Quick Reprice:** **Default 10%** off current price; radio/helper copy updated; **Discount Settings** remains **above** the scan row. **“This Session”** still titled that way; list + totals persist **this browser · local calendar day** (`localStorage`, new list after **local midnight**). Subtle caption under the card explains scope.

---

## [2.2.2] — 2026-03-27

### Added

- **Steering:** Initiative **archiving** requires **explicit user approval** (documented in [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md), [`_archived/ARCHIVE.md`](.ai/initiatives/_archived/ARCHIVE.md), [`.ai/protocols/startup.md`](.ai/protocols/startup.md), [`.ai/protocols/review_bump.md`](.ai/protocols/review_bump.md), [`.ai/context.md`](.ai/context.md)). Initiative [`e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/e2e_retag_quick_reprice_fixes.md) **restored** to the active index with expanded scope *(now archived as [completed](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md)).*
- **Inventory — Quick reprice (sold units):** **`POST /api/inventory/items/:id/duplicate-for-resale/`** (staff) creates a new **on-shelf** item from a **sold** row; **`POST /api/inventory/items/:id/mark-on-shelf/`** (Manager/Admin) when no completed POS sale exists. **Quick Reprice** dialog: **Create unsold copy & reprice**, **Mark on shelf again**, **Cancel**.
- **Inventory — Quick reprice UX:** **This Session** card with **expand/collapse** (chevron) listing all repriced items with links to **`/inventory/items/:id`**. **`?sku=`** query prefill when opening Quick Reprice from item detail.
- **Inventory — Item detail:** **Print tag** and **Reprice** (deep-link to Quick Reprice with `?sku=`). Initiative: [`e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md).

### Fixed

- **Inventory — Quick reprice:** Item list ignored `?sku=` (DRF search uses `search`, not `sku`). Added exact **`sku`** to `ItemViewSet` filterset fields so scans resolve the correct row. **Quick Reprice** uses the shared API client, normalizes SKU, shows **status**, blocks non-sellable statuses; **`POST .../quick-reprice/`** rejects disallowed statuses with HTTP 400.
- **Inventory — Retag history:** History fetch failures show an error alert; summary tiles distinguish **all-time totals** vs **tags this visit** vs **this session only** (server log count).

### Changed

- **Initiatives layout:** Replaced `.ai/plans/` with `.ai/initiatives/` (main `_index`, `_archived/` buckets). Updated `.ai/context.md`, protocols, extended docs, notebook links.
- **Documentation layout:** Setup in `.ai/extended/development.md`; removed standalone `docs/` tree from prior layout; E2E checklist under `workspace/testing/`.

---

## [2.2.1] — 2026-03-25

### Added
- **Print server Windows installer:** `cleanup_legacy_prior()` in `printserver/installer/setup.py` removes legacy V2 stack (Startup `Eco-Thrift Print Server.vbs`, `C:\DashPrintServer` / `C:\PrintServer` when `print_server.py` + `venv\` exist) and frees port 8888 before installing V3; same cleanup runs at start of uninstall. Optional IT batch: `printserver/installer/uninstall_legacy_prior.bat`.
- **Print server** bumped to **1.0.7** (`printserver/config.py`, `CHANGELOG`) for the installer change.

### Changed
- **AI / steering docs:** `.ai/extended/print-server.md`, `.ai/plans/print_server_v3_testing_and_migration.md`, `.ai/reference/PrintServer (V2)/LEGACY_UNINSTALL.md` aligned with in-installer migration (no standalone `scripts/printserver_uninstall_all`); `.ai/context.md` and `README.md` updated.
- **`docs/development.md`:** Print server notes and layout table; this repo’s `docs/` tree may only contain this file plus any other paths you keep locally.

---

## [2.2.0] — 2026-03-25

### Added
- **B-Stock notebook scraper package:** `workspace/notebooks/Scraper/` with `BStockScraper` (`get_auctions`, `update`, `save_to_disk`), HTTP client + config loader, optional Playwright module (`python -m Scraper.browser`), experimental `refresh_token` helper, `examples/bstock_quickstart.ipynb`, CLI `python -m Scraper` when run from `workspace/notebooks`. Secrets in gitignored `Scraper/bstock_config_local.py` (template: `Scraper/config.example.py`).

### Changed
- **Notebooks docs:** `workspace/notebooks/README.md` and `docs/development.md` updated for `Scraper/` layout; `.ai/plans/bstock_scraper.md` and plans index refreshed.

### Removed
- Flat B-Stock scripts at `workspace/notebooks/` root (`bstock_scraper.py`, `bstock_scraper_browser.py`, `bstock_refresh_token.py`, `bstock_config.example.py`) — replaced by the `Scraper` package.

---

## [2.1.0] — 2026-03-24

### Added
- **Purchase order reset safety:** `GET /api/inventory/orders/:id/delete-preview/` and `POST /api/inventory/orders/:id/purge-delete/` (order-number confirmation).
- **Preprocessing preview search:** Server-side search over full raw manifest and full standardized output (top-100 preview window per endpoint).
- **Project / AI layout (BEST-spec alignment):** Repo root `.version` and `CHANGELOG.md`; `.ai/protocols/` (`startup.md`, `review_bump.md`); `.ai/plans/_index.md` and `plans/archive/`; `.ai/reference/`; committed `scripts/dev/` (`start_servers.bat`, `kill_servers.bat`) and `scripts/deploy/commit_message.txt`.
- **Root spec:** `2.EcoThrift.project_build_spec.md` describing layout, versioning, and protocols.
- **Multi-DB Jupyter:** Tracked `workspace/notebooks/` (selective gitignore): `README.md`, `config.example.py`, `db_explorer.ipynb` — SQLAlchemy + pandas helpers, pickles dir ignored; optional `requirements-notebooks.txt` (includes former ML deps).
- **`.ai/extended/databases.md`:** DB1 / DB2 / DB3 overview; credentials stay out of repo; points to `docs/Database Audits/`.

### Changed
- **App version API:** `GET /api/core/system/version/` reads repo root `.version` only; response still includes `build_date` / `description` as null/empty (reserved).
- **Dependencies:** Merged `requirements-ml.txt` into `requirements-notebooks.txt`; updated `train_price_model`, `categorizer`, `docs/retag/after_retag.md`, and related docs.
- **Notebooks:** `db_explorer.ipynb` resolves notebook dir when Jupyter cwd is repo root; optional `NOTEBOOK_DIR` env; `config_local.py` (gitignored) can load `DATABASE_*` from project `.env`.
- **Preprocessing UI:** Multi-open 3-step accordion (upload → raw sample → standardize); taller default viewports for raw/standardized tables; Inventory and POS sidebar sections collapsible like HR.
- **Docs:** `README.md`, `docs/architecture.md`, `docs/development.md`, `docs/api-reference.md`, `.ai/context.md` updated for new paths and versioning.

### Removed
- `.ai/version.json` and `.ai/changelog.md` (superseded by root `.version` + `CHANGELOG.md`).
- `.ai/procedures/` (replaced by `.ai/protocols/` with merged content).
- `.ai/extended/TOC.md` (extended docs indexed by filename).
- `requirements-ml.txt` (merged into `requirements-notebooks.txt`).

---

## [2.0.0] — 2026-03-04

### Added
- **Retag v2 — DB2→DB3 Migration System**: Full on-site retag workflow. `TempLegacyItem` model (staging table of active DB2 items, populated by `import_db2_staging`). `RetagLog` model (per-event log for retag day). Three `retag_v2_*` API endpoints (`lookup`, `create`, `history`). `RetagPage.tsx` at `/inventory/retag`. Supports 4 price strategies (keep current / % of current / AI estimate / % of retail), auto-print on scan, non-blocking "already retagged" snackbar warnings, always creates a new DB3 item per scan. Paginated history panel with summary tiles (total tagged, sum retail, sum price), search, and session filter. **Both `TempLegacyItem` and `RetagLog` are temporary scaffolding — drop after retag day.**
- **Pricing Model Foundation**: Management commands scaffolded: `import_historical_sold` (~145K sold items from DB1+DB2 for ML training data), `import_historical_transactions` (~68K transactions into `HistoricalTransaction` for multi-generation revenue reporting), `train_price_model` (gradient-boosted price estimator, output to `workspace/models/price_model.joblib`), `backfill_categories` (retroactive category classifier). Ready to run after retag day.
- **`very_good` condition**: Added `('very_good', 'Very Good')` to `CONDITION_CHOICES` on `Item`, `ManifestRow`, and `BatchGroup` models (migration `0010_add_very_good_condition`).
- **Database audits**: Full schema and row-count audits in `docs/Database Audits/` for DB1 (`old_production_db` archive), DB2 (`ecothrift_v2` production), DB3 (`ecothrift_dev` new production).
- **Retag day ops docs**: `docs/retag/before_retag.md` (prep checklist, data clearing, end-to-end test plan, price strategy guide) and `docs/retag/after_retag.md` (cleanup, historical import, model training, deployment checklist).

---

## [1.9.1] — 2026-02-26

### Fixed
- **POS `CartFilter` `status=open` fallthrough**: `filter_status` only handled `all`, `completed`, `voided` — `open` fell through returning all carts (including voided ones), causing voided carts to be restored on mount. Added `open` to the handled values.
- **Prefetch cache staleness after cart mutations**: `CartViewSet` uses `prefetch_related('lines')` which caches lines on the object. After `add_item` and `manage_line` mutations the serializer read stale prefetch cache, returning data one step behind. Fixed by re-fetching cart via `self.get_queryset().get(pk=cart.pk)` after `recalculate()`.
- **Cart restore stale React Query cache on navigation**: `useCarts` React Query hook served stale cached data instantly on `TerminalPage` remount, restoring an outdated cart before the fresh network response arrived. Replaced with direct `getCarts()` API call in a `useEffect` that always makes a fresh network request.
- **Duplicate CartLines on repeated item scan**: `add_item` was creating a new `CartLine` every time the same SKU was scanned. Now increments `quantity` on the existing line instead.

### Added
- **Inline cart line editing**: Edit icon per line opens in-place `TextField`s for `quantity`, `description`, and `unit_price`. Backend `manage_line` action serves both `PATCH` (update) and `DELETE` (remove) on `lines/{line_id}/`.
- **Void Sale button**: Red "Void" button + `ConfirmDialog` on terminal. Calls `POST /pos/carts/{id}/void/`. Voided carts visible in Transactions by default (status filter defaults to `all`).
- **Drawer reopen**: `POST /pos/drawers/{id}/reopen/` (Manager+) reopens a closed drawer. UI button on closed-drawer cards in `DrawerListPage`.
- **Terminal state machine**: `TerminalState` union + `deriveTerminalState()` drives full-page UI branching (unconfigured / loading / no_drawer / drawer_open_other / ready+active_sale / drawer_closed / manager_mode).
- **Lazy cart creation**: Cart is created on first item scan rather than on an explicit "Start Sale" button. Sale interface shown immediately when drawer is open/ready.

---

## [1.9.0] — 2026-02-25

### Added
- **Processing Page Overhaul** (`ProcessingPage.tsx`): full "Command Center + Side Drawer" redesign
- `useLocalPrintStatus` hook: polls `/health` every 30s, exposes `online`/`version`/`printersAvailable`; persistent green/gray status chip in PageHeader
- Print server graceful degradation: check-in succeeds even when print server offline; warning snackbar + reprint recovery on Checked In tab
- Staggered batch label printing via `Promise.allSettled` with 200ms stagger and inline "Printing X/Y labels..." progress alert
- **MUI Autocomplete order selector** with search, status chips, and per-order progress indicators replacing basic dropdown
- **Circular progress ring** (% complete) + stats chips (on-shelf, pending, batches) in order context bar
- **Always-visible SKU scanner input** with F2 hotkey focus; Enter searches items by SKU and auto-opens side drawer
- **Three-tab queue** (Batches / Items / Checked In) with badge counts; tab selection persists across interactions
- **Right-side MUI Drawer** (`ProcessingDrawer.tsx`) replaces center dialog; shows form + collapsible source data context (product, brand, cost, batch info)
- **Checked In tab**: DataGrid of completed items sorted by check-in time with per-row reprint button
- **Bulk check-in**: checkbox column on Items tab, floating "Bulk Check-In" dialog with shared condition/location/price/cost overrides; calls existing `check-in-items` endpoint; prints staggered labels
- **Detach confirmation popover**: replaces immediate action; shows warning before detaching item from batch
- **Keyboard shortcuts**: F2 (scanner focus), Ctrl+Enter (check-in), Escape (close drawer), Ctrl+P (reprint), N (next item)
- **Auto-advance**: after check-in automatically opens next pending item; toggle switch in stats bar (default ON)
- **Sticky defaults**: condition + location persist in `localStorage` under `processing_sticky_defaults`; pre-fill empty fields on open
- **Copy from Last**: button in drawer copies condition/location/notes from most recently checked-in item
- **Session stats bar** (`ProcessingStatsBar.tsx`): elapsed time, items/hour rate, ETA, session item count, auto-advance toggle
- **Back to Preprocessing** navigation button in PageHeader when an order is selected
- `useItems` and `useBatchGroups` hooks accept `enabled` parameter to prevent fetching all items when no order selected

### Changed
- `queueNotBuilt` logic broadened: triggers for both `delivered` and `processing` status with zero items (was `delivered` only)
- Items query limit raised from 500 to 1000 for large orders
- Replaced local `formatCurrency` in ProcessingPage with shared `formatCurrency` from `utils/format.ts`
- DataGrid density set to `compact` across all three tabs for higher information density

---

## [1.8.0] — 2026-02-25

### Added
- **Local Print Server** (`printserver/`): standalone FastAPI server on `127.0.0.1:8888` for label, receipt, and cash drawer printing via Windows GDI/ESC-POS
- Built-in browser UI at `/` (printer assignment dropdowns, test buttons) and `/manage` (status, auto-start toggle with Enabled/Disabled label, version check, changelog, uninstall)
- Windows self-contained installer (`ecothrift-printserver-setup.exe`) with Tkinter GUI, registry auto-start, port-kill on reinstall
- `distribute.bat` / `distribute.py`: builds both exes, uploads setup exe to S3, registers release in Django DB using management commands — no credentials required
- Django `publish_printserver` management command for credential-less release registration
- Public (no-auth) `print-server-version-public` endpoint for version checks from the print server management page
- Admin SettingsPage redesigned: printer assignment dropdowns, test label/receipt/drawer buttons, Client Download section, Online chip links to `/manage`
- Server-side update-check proxy (`/manage/check-update`) to avoid browser CORS restrictions
- `CORS_ALLOWED_ORIGINS` updated to include `127.0.0.1:8888`

---

## [1.7.0] — 2026-02-21

### Added
- **Preprocessing Undo System**: Every preprocessing step has a working undo with cascade confirmation. `deriveCompletedStep()` is the single source of truth for step completion state. Backend endpoints: `undo-product-matching` (Step 3), `clear-pricing` (Step 4). `cancel-ai-cleanup` updated to cascade and also clear Step 3 matching fields.
- **6-State Step 1 Button Logic**: Standardize step derives state (clear/partial/ready/done/edited/edited_partial) from formula state and standardization status. Two separate button rows: primary actions (Standardize/Re-standardize/Undo) and formula-level actions (Clear Formulas/Cancel Edits/Use AI). Tracks formulas at standardization time via ref for edit detection.
- **Complete Preprocessing in Breadcrumbs**: "Complete Preprocessing" button rendered inline at end of breadcrumb chip row (visible when Step 4 active, all rows priced, not yet finalized).
- **Shared Formatting Utilities**: `formatCurrencyWhole` (commas, no decimals), `formatCurrency` (commas, 2 decimals), `formatNumber` (locale-formatted counts) in `frontend/src/utils/format.ts`. Applied across OrderListPage, OrderDetailPage, FinalizePanel.
- **Auto-Build Check-In Queue on Deliver**: `deliver` endpoint automatically creates Items + BatchGroups when manifest rows exist and no items exist. Eliminates manual "Build Check-In Queue" step for the standard flow. `create-items` endpoint preserved for edge cases (manifest processed after delivery).
- **Section Dividers**: `<Divider>` components between major sections in all 4 preprocessing step panels for visual clarity.

### Changed
- **Breadcrumb Navigation**: Removed all "Continue to..." / "Next Step" / "Confirm Products" navigation buttons from Steps 1-3. Navigation is exclusively via breadcrumb chips with 4 visual states (selected/done/ready/notReady with pulse animation). Accept All in Step 3 now also confirms/submits decisions.
- **OrderDetailPage**: All 4 action buttons (Back/Preprocessing/Processing/Delete) merged into PageHeader row. Separate "Go To" card removed.
- **OrderListPage**: Actions column moved to first position with 'Actions' header.
- **Step 2 Buttons**: Renamed (Run Cleanup, Pause Cleanup, Restart Cleanup, Cancel Cleanup, Clear Cleanup). Removed Re-run when done — only Clear shown.
- **Step 3 Accept All**: Only visible when undecided matched rows exist; shows count.
- **Step 4 renamed**: "Review & Finalize" → "Pricing" throughout.
- **Preview Empty State**: Changed from "Click Preview Standardization" to "Preview will appear when formulas are applied."
- **ConfigurablePageSizePagination**: Custom DRF pagination class allows client to specify `page_size`.

### Fixed
- Processing page "No rows" issue: broadened `queueNotBuilt` logic to always render queue sections when an order is selected.
- `deliver` endpoint now auto-creates items from manifest rows, preventing "Build Check-In Queue" friction.

---

## [1.6.0] — 2026-02-18

### Added
- **AI Integration Foundation** (`apps/ai/`): New Django app with `ChatProxyView` (POST `/api/ai/chat/`) and `ModelListView` (GET `/api/ai/models/`) proxying Anthropic Claude API. Models: `claude-sonnet-4-6`, `claude-haiku-4-5`.
- **Expression-Based Formula Engine** (`apps/inventory/formula_engine.py`): Full expression parser supporting `[COLUMN]` refs, functions (`UPPER`, `LOWER`, `TITLE`, `TRIM`, `REPLACE`, `CONCAT`, `LEFT`, `RIGHT`), `+` concatenation, and quoted string literals. Used by `normalize_row()` alongside legacy source+transforms path.
- **AI-Assisted Row Cleanup**: `POST /api/inventory/orders/:id/ai-cleanup-rows/` sends manifest rows to Claude in batches for title/brand/model/specs cleanup. Supports `batch_size` and `offset` for frontend-driven batch processing.
- **AI Cleanup Status & Cancel**: `GET ai-cleanup-status/` returns progress counts; `POST cancel-ai-cleanup/` clears all AI-generated fields.
- **Concurrent Batch Processing**: Frontend worker pool pattern — configurable batch size (5/10/25/50 rows) and concurrency (1/4/8/16 threads). Up to 16 simultaneous API requests for faster processing.
- **Expandable Row Detail Panels**: Cleanup table rows are expandable with chevron toggle. Expanded view shows side-by-side "Original Manifest Data" vs "AI Suggestions" cards with change highlighting, specifications key-value grid, and AI reasoning quote block. Multiple rows expandable simultaneously.
- **Standalone Preprocessing Page**: Moved from `/inventory/orders/:id/preprocess` to `/inventory/preprocessing/:id` with its own sidebar navigation entry. localStorage persistence of last preprocessed order ID. Legacy route redirects for backward compatibility.
- **Product Matching Engine**: Fuzzy scoring (UPC exact, VendorRef exact, text similarity) + AI batch decisions. New fields on `ManifestRow`: `match_candidates`, `ai_match_decision`, `ai_reasoning`, `ai_suggested_title/brand/model`. Endpoints: `match-products`, `review-matches`, `match-results`.
- **ManifestRow Extended Fields**: `title`, `condition`, `batch_flag`, `search_tags`, `specifications` (JSONField), plus all AI suggestion and match fields. Two new migrations applied.
- Frontend API layer: `ai.api.ts`, `useAI.ts` hooks, `ModelSelector` component, cleanup/status/cancel API functions and React Query hooks.
- `StandardManifestBuilder` reworked for expression text input with syntax highlighting and autocomplete.
- `RowProcessingPanel` with flat form layout: AI cleanup controls, rows table, product matching section, review decisions section.
- `FinalizePanel` with merged pricing controls.

### Changed
- Preprocessing stepper: 4 steps (Standardize Manifest → AI Cleanup → Product Matching → Review & Finalize)
- Manifest upload removed from preprocessing page (stays on Order page)
- `useStandardManifest` hook reworked to use `formulas: Record<string, string>` instead of rules-based state
- `MANIFEST_TARGET_FIELDS` and `MANIFEST_STANDARD_COLUMNS` updated with new fields
- Default batch size changed to 5 rows; default concurrency set to 16 threads

### Fixed
- Infinite re-render loop in `PreprocessingPage.tsx`: `useEffect` dependency on full `order` object replaced with scalar values (`orderVendorCode`, `orderPreviewTemplateName`); `rawManifestParams` useMemo dependency changed from object ref to boolean; `matchSummary` prop memoized with `useMemo`
- Step 4 (Review & Finalize) freeze: template name and step-derived effects guarded to prevent update-depth loop; FinalizePanel table paginated (50 rows/page) to avoid rendering 400+ rows and blocking main thread
- `anthropic` library lazy-imported in `apps/ai/views.py` to prevent `ModuleNotFoundError` at Django startup
- Outdated Claude model IDs replaced: `claude-sonnet-4-5-20250514` → `claude-sonnet-4-6`, `claude-haiku-3-5-20241022` → `claude-haiku-4-5`
- `cancel_ai_cleanup` corrected from `specifications=dict` to `specifications={}`

---

## [1.5.0] — 2026-02-17

### Added
- `PreprocessingPage` at `/inventory/orders/:id/preprocess`: dedicated 3-step stepper wizard (Upload Manifest → Standardize Manifest → Set Prices) extracted from `OrderDetailPage`
- Route added in `App.tsx` for the new preprocessing page
- "Clear All" button in the pricing step to wipe all proposed prices and auto-save
- Warning `Alert` on Step 3 when any manifest rows are missing `retail_value`
- Auto-save on every pricing action (Apply to All, Clear All, individual field blur) with inline saving indicator

### Changed
- `OrderDetailPage` simplified: full preprocessing accordion block removed (~260 lines), replaced with a single "Open Preprocessing" CTA card
- Step 3 pricing UI redesigned: removed mode toggle, all price inputs always editable, no explicit Save Prices button
- `retail_value` mapping is now enforced as required at standardization — `handleStandardizeManifest` blocks with a warning snackbar if unmapped

### Fixed
- Infinite render loop in `PreprocessingPage`: `manualPrices` `useEffect` now uses stable `rowsKey` dependency (row IDs joined as string) instead of `manifestRows ?? []` which created a new array reference every render

---

## [1.4.0] - 2026-02-16

### Added
- New Standard Manifest preprocessing contract with `preview-standardize` and `process-manifest` support for function chains per standard column
- Pre-arrival manifest pricing support on `ManifestRow` (`proposed_price`, `final_price`, `pricing_stage`, `pricing_notes`)
- New pricing endpoint `POST /api/inventory/orders/:id/update-manifest-pricing/` for bulk manifest-row pricing updates
- New check-in endpoints:
  - `POST /api/inventory/orders/:id/check-in-items/` (bulk order check-in)
  - `POST /api/inventory/items/:id/check-in/` (single-item check-in)
  - `POST /api/inventory/batch-groups/:id/check-in/` (batch check-in)
- New check-in tracking fields on items: `checked_in_at`, `checked_in_by`
- New reusable frontend Standard Manifest modules:
  - `useStandardManifest` hook
  - `StandardManifestBuilder` component
  - `StandardManifestPreview` component

### Changed
- Replaced old order preprocessing UI with a cleaner Standard Manifest workflow and primary action **Standardize Manifest**
- Replaced prior processing page with a unified processing workspace centered on:
  - set fields,
  - check in,
  - print tags
- `create-items` now acts as a check-in queue builder and enforces post-delivery creation

### Fixed
- Removed old row-expression preprocessing/filtering flow that caused clunky UX and replaced it with explicit standard-column mapping
- Reduced processing-step/button sprawl by consolidating actions into a single arrival workflow

---

## [1.3.0] - 2026-02-16

### Added
- M3 inventory processing implementation finalized: all units are created as `Item` rows with optional `BatchGroup` acceleration for high-quantity rows
- Full manifest preprocessing flow on order detail page: raw row selection, row-expression selection (`1-50,75`), source-to-target column mapping, and per-field transforms
- Transform support in manifest normalization: `trim`, `title_case`, `upper`, `lower`, `remove_special_chars`, and `replace`
- Header-signature-based template workflow: load prior formulas by manifest header signature and save updated mappings for future uploads
- New inventory endpoint `GET /api/inventory/orders/:id/manifest-rows/` for full CSV row retrieval during preprocessing
- New M3 inventory APIs and UI integrations for product matching, batch group processing, item detachment, item history, and category CRUD

### Changed
- `process-manifest` now parses the full uploaded manifest file (not only preview rows) when explicit `rows` payload is not provided
- Processing page redesigned around M3 queues: Batch Queue + Individual Queue + Detached/Exception items
- Order detail manifest workflow now aligns to M3 sequence: preprocess -> process rows -> match products -> create items+batches -> mark complete
- Inventory and project documentation updated to make M3 the authoritative processing model

### Fixed
- Corrected manifest processing bug where only 20 preview rows were normalized instead of the full uploaded file

---

## [1.2.0] - 2026-02-13

### Added
- Purchase Order 6-step status workflow: ordered → paid → shipped → delivered → processing → complete
- Status action buttons: Mark Paid, Mark Shipped, Mark Delivered with dedicated UX modals
- Status undo buttons: Undo Paid, Undo Shipped, Undo Delivered to revert status changes
- "Shipped" modal with dual modes (Mark Shipped / Edit Shipped) including date pickers for shipped_date and expected_delivery
- Cost breakdown: purchase_cost + shipping_cost + fees = total_cost (auto-computed in model save)
- New PO fields: paid_date, shipped_date, retail_value, condition (dropdown), description, order_number (editable)
- Auto-generated order numbers (PO-XXXXX) with option to provide custom values
- CSV manifest upload persists to S3 with S3File record and manifest_preview JSON field
- S3File download URL via presigned URL property
- Manifest file info bar on detail page with filename, size, upload date, and Download button
- Ordered date editable on both create and edit forms
- Order list view enhanced with Description, Condition, Items, Retail Value columns

### Changed
- PO status choices renamed: `in_transit` → `shipped`, added `paid`
- Edit Order dialog reorganized: Order # + Date → Details → Costs → Notes (consistent across create/edit/detail)
- Create Order dialog now includes all fields matching edit dialog (# Items, condition, retail value, description)
- Upload manifest endpoint now returns full order detail instead of transient preview
- useUploadManifest hook invalidates specific order query for immediate UI refresh

---

## [1.1.0] - 2026-02-13

### Added
- Multi-role user model: User can simultaneously hold Employee, Customer, and Consignee profiles via Django Groups
- User `roles` property returning all assigned group names
- Employee termination workflow: termination type (10 industry-standard types), date, notes, status badge with tooltip
- Consignee account management: create from existing or new user, profile editing, soft-delete
- Consignee detail page with account settings and nested agreements (drop-offs)
- Customer management: full CRUD with auto-generated customer numbers (CUS-XXX)
- POS customer association: scan customer ID (CUS-XXX) at terminal to link customer to cart
- Admin password reset: generates temporary password for any user
- Forgot password flow: request reset token, enter new password (email delivery stubbed)
- Time entry modification requests: employee submit, manager approve/deny
- Phone number formatting utility (formatPhone, maskPhoneInput, stripPhone) applied across all UI
- Reusable ConfirmDialog component for destructive actions
- StatusBadge tooltip support for contextual information on hover
- Item detail page for viewing/editing individual inventory items
- ForgotPasswordPage with multi-step form
- ConsigneeDetailPage with profile editing and agreement management

### Changed
- AccountsPage rewritten to list consignee people (accounts) instead of agreements
- Agreement creation now defaults commission rate from consignee profile, start date to today, terms to standard template
- ConsigneeAccountViewSet uses user ID for lookups (not profile ID)
- DataGrid action columns vertically centered across all pages
- Date input fields use shrunk labels to prevent overlap
- Add Consignee dialog uses ToggleButtonGroup instead of confusing toggle switch

### Fixed
- EmployeeDetailPage crash: departments.map TypeError from paginated API response
- ConsigneeDetailPage 404: ID mismatch between frontend (user ID) and backend (profile ID)

---

## [1.0.0] - 2026-02-13

### Added
- Django 5.2 backend with 6 apps: accounts, core, hr, inventory, pos, consignment
- Custom User model with email-only authentication
- JWT auth with httpOnly cookie refresh tokens and in-memory access tokens
- Role-based access: Admin, Manager, Employee, Consignee (Django Groups)
- React 19 + TypeScript frontend with Vite, MUI v7, TanStack React Query
- 24 page components across dashboard, HR, inventory, POS, consignment, admin, and consignee portal
- Time clock with automatic clock-in (empty body POST)
- Sick leave accrual system (1 hour per 30 hours worked, 56-hour annual cap)
- Inventory pipeline: vendors, purchase orders, CSV manifest processing, item creation
- POS terminal with SKU scanning, cart management, cash/card/split payments
- Cash management: drawer open/close/handoff, cash drops, supplemental drawer, bank transactions
- Denomination breakdown tracking (JSON fields) across all cash operations
- Consignment system: agreements, item tracking, payout generation
- Consignee portal: self-service items, payouts, summary dashboard
- Dashboard with today's revenue, weekly chart, 4-week comparison table, alerts
- Public item lookup by SKU (no auth required)
- Local print server integration service (FastAPI at localhost:8888)
- Seed data management command (groups, admin user, registers, settings)
- Heroku deployment config (Procfile, WhiteNoise, gunicorn)
- Project documentation in docs/
- Developer workspace with bat scripts and Jupyter notebook

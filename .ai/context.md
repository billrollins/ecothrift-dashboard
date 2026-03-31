<!-- Last updated: 2026-03-31T18:00:00-05:00 -->
# Eco-Thrift Dashboard — AI Context

## Project Summary

Eco-Thrift Dashboard is a full-stack business management application for a thrift store in Omaha, NE. It covers HR (time clock, sick leave), inventory (vendors, purchase orders, item processing), point-of-sale (registers, drawers, carts, receipts), consignment (agreements, payouts), and an admin dashboard. Built with Django 5.2 + DRF on the backend and React 18.3 + TypeScript + MUI v7 on the frontend. PostgreSQL database. Deployed to Heroku.

**Current version:** See repo root `.version` (e.g. `v2.2.6`).

---

## File Map

```
ecothrift-dashboard/
├── ecothrift/              Django project settings and root URLs
├── apps/
│   ├── accounts/           Users, profiles, auth, permissions
│   ├── ai/                 Claude API proxy (chat, models)
│   ├── core/               Locations, app settings, S3 files, print server
│   ├── hr/                 Time clock, departments, sick leave
│   ├── inventory/          Vendors, POs, products, items, processing
│   ├── pos/                Registers, drawers, carts, receipts, cash mgmt
│   └── consignment/        Agreements, consignment items, payouts
├── frontend/src/
│   ├── api/                Axios service functions (one per backend app)
│   ├── components/         Layout, common, feedback, forms
│   ├── contexts/           AuthContext (JWT in-memory)
│   ├── hooks/              React Query hooks (one per domain)
│   ├── pages/              Route-level page components
│   ├── services/           Local print server client
│   ├── theme/              MUI theme config
│   ├── types/              TypeScript interfaces (one per backend app)
│   ├── App.tsx             Router + route guards
│   └── main.tsx            Entry point + providers
├── printserver/            Local print server (FastAPI, Python, Windows installer)
├── scripts/                Committed dev/deploy automation (see `.ai/extended/development.md`)
├── .ai/                    AI steering: context, protocols, initiatives, extended, reference, prototype
│   ├── protocols/          startup.md, review_bump.md, move_to_pending.md (stub → initiatives/_archived/_protocols/)
│   ├── initiatives/        _index.md (active); _archived/ARCHIVE.md + buckets + _protocols/ (lifecycle how-tos)
│   ├── extended/           Deep-dive domain docs (load on demand)
│   ├── reference/          Third-party / external context (optional)
│   └── prototype/          Design prototypes and archived explorations
├── workspace/              Temp artifacts, notebooks, side projects (almost all gitignored)
│   └── notebooks/_shared/requirements-notebooks.txt  Optional Jupyter/DB + ML deps
├── project design/         Original build specification (historical reference)
├── .version                Single-line app semver (vMAJOR.MINOR.PATCH)
├── CHANGELOG.md            Version-level changelog (repo root)
├── requirements.txt        Python dependencies
├── .env                    Local environment variables (gitignored)
└── .gitignore
```

---

## Current State

### Working
- All 6 backend apps with models, serializers, views, URLs, admin
- 28+ frontend pages rendering and connected to API
- JWT auth with httpOnly cookie refresh + in-memory access token
- Database migrations and seed data command
- TypeScript compiles with zero errors
- Vite production build succeeds
- Full CRUD across Users, Employees, Consignees, Customers, Vendors, Orders, Items, Products
- Purchase Order management: 6-step status workflow (ordered→paid→shipped→delivered→processing→complete) with action buttons and undo
- PO cost breakdown (purchase_cost + shipping_cost + fees = total_cost), retail value, condition, description
- CSV manifest upload to S3 with persisted preview and download link
- Inventory processing direction finalized: **M3 (Universal Items + Smart Batch)** — all units are Items, batches accelerate processing
- M3 workflow implementation shipped: `process-manifest` (full CSV parsing), `manifest-rows`, `match-products`, `create-items`, `mark-complete`
- Standard Manifest preprocessing UI shipped: standard-column mapping, function chains, preview, and **Standardize Manifest** primary action
- Pre-arrival pricing shipped on manifest rows (`proposed_price`, `final_price`, `pricing_stage`, `pricing_notes`) with bulk save endpoint
- Arrival check-in workflow shipped: bulk order check-in, single item check-in, batch check-in, and label printing integration in the Processing workspace
- Processing page now centers on finalize fields -> check in -> print tags, with batch detach as a secondary exception action
- **Processing Page Overhaul** (v1.9.0+): "Command Center + Side Drawer" design. MUI Autocomplete order selector (wider), circular progress ring, general search (debounced, filters items/batches), always-visible SKU scanner (F2), three-tab queue (Batches/Items/Checked In) with badge counts, right-side Drawer for item/batch editing. **Partial batch check-in**: check-in qty and mark-broken qty inputs in batch drawer; mark-broken and uncheck-in actions (single + bulk). **Batch drawer item list**: pending and checked-in items shown in batch mode; clickable to open in item form; Unprocess button on checked-in items. **Persistent column widths** (localStorage). **Settings modal** (auto-advance, print toggle, sticky defaults, hotkey cheat sheet). **Batch apply toolbar** (condition/location/price to visible items/batches). **Inline editing** on condition/location/price. **Checked In bulk actions** (Set Condition/Location/Price, Uncheck In). Bulk check-in, detach confirmation, Copy from Last, session stats bar (items/hr, ETA), full keyboard shortcuts (F2/1/2/3//?/Ctrl+Enter/Escape/Ctrl+P/Ctrl+B/Ctrl+D/N), print server status chip, staggered batch label printing, reprint on Checked In tab
- Order reset tooling shipped: order detail now includes **Delete Order** modal with reverse-sequence artifact preview + guarded purge action (`confirm_order_number`)
- Standard Manifest UX now includes 3-step accordion flow (Upload -> Raw Sample -> Standardize) with multi-open sections
- Raw and standardized preview search shipped: searches full manifest/normalized set server-side and returns top 100 rows for preview
- Sidebar navigation updated so Inventory and POS behave as grouped/collapsible sections (same pattern as HR); **v2.2.4+** sidebar scroll region and drawer paper use **`overflow-x: hidden`** and constrained flex (`minWidth: 0`) so long nav labels ellipsis instead of showing a horizontal scrollbar
- **AI Integration**: `apps/ai/` Django app proxies Anthropic Claude API (`claude-sonnet-4-6`, `claude-haiku-4-5`). Frontend `ModelSelector` component, `useAI` hooks, `ai.api.ts` service layer.
- **Dev logging (Add Item + AI)**: Hierarchical targets in **`.ai/debug/log.config`** (cascade); **`AppLogger`** in `apps/core/logging.py` routes stderr / `.ai/debug/debug.log` / API `debug` JSON per area. Add Item uses **`LOG_ADD_ITEM`** → **`LOG_ADD_ITEM_FORM`** (dialog actions) and **`LOG_ADD_ITEM_AI`** (prompt + raw response for `POST …/items/suggest/`). **`GET /api/core/dev-log/config/`** (DEBUG, staff) exposes resolved targets to the frontend; **`POST /api/core/dev-log/line/`** appends client form lines when `file` is enabled. Browser console also respects **`VITE_DEV_LOG`** in `.env`. See archived initiative [`.ai/initiatives/_archived/_completed/add_item_dialog_and_sources.md`](initiatives/_archived/_completed/add_item_dialog_and_sources.md).
- **Expression-Based Formula Engine**: `apps/inventory/formula_engine.py` parses `[COLUMN]` refs, functions (UPPER, LOWER, TITLE, TRIM, REPLACE, CONCAT, LEFT, RIGHT), string concatenation, and literals. Backward compatible with legacy source+transforms mappings.
- **AI Row Cleanup Pipeline**: `ai-cleanup-rows` endpoint processes manifest rows through Claude for title/brand/model/specs suggestions. Frontend-driven concurrent batch processing with configurable batch size (5/10/25/50) and thread count (1/4/8/16). Pause/resume/cancel with localStorage persistence.
- **Expandable Row Detail Panels**: Cleanup table rows expand to show side-by-side "Original Manifest Data" vs "AI Suggestions" with change highlighting, specs key-value grid, and AI reasoning block.
- **Standalone Preprocessing Page** at `/inventory/preprocessing/:id` with own sidebar nav entry, 4-step chip stepper (Standardize Manifest → AI Cleanup → Product Matching → Pricing). Legacy route `/inventory/orders/:id/preprocess` redirects. FinalizePanel paginated (50 rows/page) to avoid main-thread freeze with large manifests.
- **Product Matching Engine**: Fuzzy scoring (UPC, VendorRef, text similarity) + AI batch decisions. `ManifestRow` extended with `match_candidates`, `ai_match_decision`, `ai_reasoning`, `ai_suggested_title/brand/model`, `search_tags`, `specifications`, `condition`, `batch_flag`.
- **Preprocessing Undo System**: Every step has a working undo with cascade. `deriveCompletedStep()` is the single source of truth. Undo Step 1 deletes rows (blocked if Items exist); Undo Step 2 clears AI fields + cascades to clear matching; Undo Step 3 clears matching; Undo Step 4 resets pricing.
- **6-State Step 1 Button Logic**: Standardize step tracks formula state (clear/partial/ready/done/edited/edited_partial) with two separate button rows — primary actions (Standardize/Re-standardize/Undo) and formula-level actions (Clear/Cancel/Use AI).
- **Breadcrumb-Driven Navigation**: All "Next Step" / "Continue" / "Confirm" buttons removed from preprocessing steps. Navigation is via breadcrumb chips with 4 visual states (selected/done/ready/notReady). "Complete Preprocessing" button is inline in breadcrumb row.
- **Shared Formatting Utilities**: `formatCurrencyWhole`, `formatCurrency`, `formatNumber` in `frontend/src/utils/format.ts` for consistent dollar/count display.
- **Auto-Build Check-In Queue**: `deliver` endpoint automatically creates Items + BatchGroups when manifest rows exist, eliminating the manual "Build Check-In Queue" step.
- `OrderDetailPage` simplified: all nav buttons merged into PageHeader (Back/Preprocessing/Processing/Delete), Go To card removed
- `OrderListPage` enhanced: Actions column first with header, row-level Preprocessing/Processing icon buttons
- Pre-arrival pricing redesigned: no mode toggle, always-editable table, auto-save on Apply All / Clear All / field blur, `retail_value` mapping enforced as required at standardization
- Alternative inventory prototypes archived under `.ai/prototype/archive/`
- **Local Print Server** (`printserver/`): FastAPI on `127.0.0.1:8888`; labels, receipts, drawer. **`ecothrift-printserver-setup.exe`** on Install runs **legacy cleanup** (V2 Startup VBS, `C:\DashPrintServer` / `C:\PrintServer` when `print_server.py`+`venv` present, kill port 8888) then installs V3 under `%LOCALAPPDATA%\EcoThrift\PrintServer\` with HKCU Run auto-start. **Labels (2026-03):** side-stripe layout (⅓ stripe, smaller `$`, larger dollar line + cents; dollar digits inset when whole dollars > 0; **sub-dollar:** `$` + cents only, no middle `0`); price fit scales 1.0–0.5 step 0.01; Windows GDI print fit/center/top for roll stock; source **v1.2.38** in `printserver/config.py` (see `printserver/CHANGELOG.md`). **Label price layout initiative archived:** [`.ai/initiatives/_archived/_completed/print_server_label_price_layout.md`](initiatives/_archived/_completed/print_server_label_price_layout.md). Consultant handoff: `.ai/reference/Consult Label/`. **`distribute.bat`** → S3 + `PrintServerRelease` (installer version follows `printserver/config.py`, not repo root `.version`). **`dev_print_e2e_3_labels.bat`** prints three sample labels from `workspace/testing/data/retag_e2e_10_items.json`; **`scripts/label_price_fringe_grid.py`** generates fringe PNGs + fit stats (gitignored `output_label_fringe_review/`). Details: `.ai/extended/print-server.md`.
- Editable order number (auto-generated PO-XXXXX or user-provided)
- Multi-role user model (User can be Employee + Consignee + Customer simultaneously)
- Employee termination workflow with termination type, date, and notes
- Consignee account management (create from existing or new user, profile editing)
- Consignment agreements per drop-off with default commission/terms
- Customer management with POS customer association via scan
- Admin password reset (generates temporary password)
- Forgot password flow (stubbed token — no email delivery yet)
- Phone number formatting across UI
- Time entry modification requests (employee submit, manager approve/deny)
- DataGrid action columns vertically centered across all pages
- **POS system overhaul**: Device identity via `pos_device_config` (localStorage) — device type and register per machine. **Terminal**: Auto-register from config, drawer status banner, inline open drawer and Takeover, receipt printing and cash drawer auto-open on completion, print server status chip. Terminal state machine (`TerminalState` + `deriveTerminalState`). Lazy cart creation (cart created on first scan). Cart persistence via direct `getCarts()` API call on mount (bypasses React Query cache). Inline line editing (qty/description/price). Void Sale button + ConfirmDialog. **Drawers**: Manager-focused cards with status chips, expected cash (opening + sales − drops), variance display on close, role-based view (employees see only their register + cash drop; managers see Handoff/Close/Reopen). **Transactions**: Receipt # search, cashier dropdown, status filter (All/Completed/Voided — defaults to All), receipt reprint, payment breakdown, void with loading state. **Cash Management**: Supplemental last-counted display, draw-over-balance warning, bank transaction date filter (client-side). **Backend**: Drawer open validation, `takeover` action, `reopen` action (Manager+), `CartFilter` (status=open/completed/voided/all, receipt_number, date_from, date_to, drawer, cashier), `manage_line` action (single PATCH+DELETE handler for cart lines), `add_item` deduplication (increments qty on existing line), prefetch-cache refresh after mutations, `CartSerializer` read-only fields (cashier, subtotal, tax_amount, total, tax_rate). Single **ConfirmDialog** in `common/` (severity + loading).
- **Retag v2 — DB2→DB3 migration system** (v2.0.0): Full retag workflow to migrate all on-shelf items from the old DB2 production system to DB3. **Retag history panel** surfaces load errors; **“This session only”** shows server log count since page load; summary tiles distinguish all-time vs this-visit counts. **Quick reprice** (`/inventory/quick-reprice`): exact `sku` filter, status display, sold-item duplicate / manager mark-on-shelf, **This Session** expandable list with links to **`/inventory/items/:id`** (list persists **this browser · local calendar day** via `localStorage`, new list after local midnight; still labeled “This Session”), default **10%** discount, **Discount Settings** above scan row; **`?sku=`** prefill from item detail **Reprice**. **Item detail** (`/inventory/items/:id`): **Print tag** and **Reprice**; after **Save**, if price/title/brand changed, **label reprint** reminder banner with **Reprint label**. See `CHANGELOG` **2.2.3**; E2E initiative [archived completed](initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md). Includes: `TempLegacyItem` model (staging table of all active DB2 items), `RetagLog` model (per-event retag log for retag day), `import_db2_staging` management command (populates staging from local DB2 snapshot), `retag_v2_lookup_view` / `retag_v2_create_view` / `retag_v2_history_view` API endpoints, `RetagPage.tsx` frontend at `/inventory/retag`. Retag app supports 4 price strategies (keep current, % of current, AI estimate, % of retail), auto-print on scan toggle, non-blocking "already retagged" warnings (always creates new DB3 item regardless), paginated history panel with summary tiles (total tagged, sum retail, sum price), search, and session filter. **Bulk labels (v2.2.5+):** optional **`quantity`** on **`POST …/retag/v2/create/`** (1–50), **`created`** in the response; the browser prints with staggered **`POST /print/label`** to the local print server (no new print-server routes). **v2.2.6:** **Labels / qty** resets to **1** after a successful multi-unit tag. **Both `TempLegacyItem` and `RetagLog` are temporary scaffolding — drop after retag day (March 16). See `.ai/extended/retag-operations.md`.**
- **Pricing model foundation** (v2.0.0): Management commands scaffolded for the full pricing ML pipeline: `import_historical_sold` (loads ~145K sold items from DB1+DB2 for training data), `import_historical_transactions` (loads ~68K transactions into `HistoricalTransaction` for revenue charting across all 3 dashboard generations), `train_price_model` (gradient-boosted price estimator saved to `workspace/models/price_model.joblib`), `backfill_categories` (retroactive category classification). None of these have been run yet — they are ready to run after retag day.
- **`very_good` condition**: Added `('very_good', 'Very Good')` to `CONDITION_CHOICES` on `Item`, `ManifestRow`, and `BatchGroup`.
- **Database audits**: Long-form schema exports for DB1/DB2/DB3 are kept locally under `workspace/` if you maintain them; routing notes in `.ai/extended/databases.md`.
- **B-Stock notebook scraper** (v2.2.0): Tracked package `workspace/notebooks/bstock-scraper/Scraper/` — `BStockScraper` with `get_auctions()` / `update()` / `save_to_disk()`; CLI `python -m Scraper` from `workspace/notebooks/bstock-scraper`; Playwright fallback `python -m Scraper.browser`; config + secrets in gitignored `Scraper/bstock_config_local.py`. `get_manifests()` is Phase 2 (NotImplementedError until manifest XHR is wired). See `workspace/notebooks/_shared/README.md`, `.ai/initiatives/_archived/_pending/bstock_scraper.md`.

### Known Issues
- **Concurrent AI cleanup needs testing/hardening**: The concurrent batch processing (16 threads x 5 rows) was just implemented. The user reported "there's a lot wrong" but did not specify what. The next session should test the concurrent cleanup flow end-to-end and fix any issues. Possible problems: race conditions in offset assignment, duplicate row processing, error handling when multiple workers fail, progress counter accuracy.
- **`anthropic` package must be installed in venv**: `pip install anthropic` in the venv. The import is lazy (won't crash server if missing) but AI features won't work without it.
- Recharts ResponsiveContainer may log a width/height warning on initial render (cosmetic, does not affect functionality)
- Large JS bundle (~1.7MB) — could benefit from code splitting via lazy routes
- POS cash completion path should be hardened for malformed numeric payloads (e.g., `change_given` string coercion edge cases)
- **Retag scaffolding must be dropped after March 16**: `TempLegacyItem` and `RetagLog` are temporary models. After retag day is verified successful, drop the tables (`DROP TABLE inventory_retaglog; DROP TABLE inventory_templegacyitem;`), remove the model classes, create a removal migration, and remove all retag v2 API endpoints, frontend page, and sidebar link. Full instructions in `.ai/extended/retag-operations.md`.
- **DB2 staging import must be re-run before retag day**: Run `python manage.py import_db2_staging --update-existing` the night before or morning of March 16 to refresh the staging table with the latest DB2 prices. See `.ai/extended/retag-operations.md`.

### Not Yet Implemented
- Email notifications (forgot-password tokens are returned in response, not emailed)
- Test suite (no unit or integration tests yet)
- Heroku deployment (config exists, not yet deployed)
- Pricing ML model not yet trained — requires running `import_historical_sold` then `train_price_model` after retag day
- `backfill_categories` not yet run — run after retag cleanup to improve pricing model accuracy

### Deferred (POS)
- Email receipts (Receipt model has `emailed` flag; no delivery)
- Barcode scanning via camera in POS (`@zxing/library` present, not wired)
- Refund flow (partial refunds, refund to different method; distinct from void)
- Multi-location supplemental drawer (backend uses `.first()`)
- Offline/degraded POS (queue transactions when server down)
- POS reports/analytics (daily/weekly/monthly revenue, cashier performance)
- Customer loyalty / rewards
- Discount / coupon system
- Void reason field (backend void endpoint does not store reason)

### Next focus and backlog

**`.ai/initiatives/_index.md`** lists **active** initiatives — currently **[Django Admin navigation / hard refresh](initiatives/django_admin_legacy_navigation.md)** (**`contrib.admin`** at **`/db-admin/`**; React in-app admin remains **`/admin/*`** — refresh fix shipped 2026-03-30; confirm prod then archive when ready). Prior E2E retag/Quick reprice work is [archived completed](initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md). **Receipt format** and **location labels** are **pending** off the main index — [`.ai/initiatives/_archived/_pending/print_server_receipt_format.md`](initiatives/_archived/_pending/print_server_receipt_format.md), [`.ai/initiatives/_archived/_pending/create_location_label.md`](initiatives/_archived/_pending/create_location_label.md). **[`.ai/initiatives/_archived/ARCHIVE.md`](initiatives/_archived/ARCHIVE.md)** catalogs completed, backlog, **pending**, and abandoned work. **Initiatives are archived only when the user explicitly approves** — see protocols and `_index.md`. Priorities also live in **`CHANGELOG.md`** and the user’s session message.

**Initiatives and versioning:** **Major, minor, and patch** bumps (repo `.version`, root `package.json`, `CHANGELOG.md`) follow **user-visible behavior and API contract** — not a 1:1 rule with initiative files (see `_index.md` under “CHANGELOG, `.version`, and releases”). Even so, **shipping work should stay traceable to named initiatives** in `_index.md` unless the change is explicitly outside that model (e.g. hotfix). If an AI session or a **review_bump** pass cannot tell **which initiative** is being worked on or released, that is a **process gap**: the user should **name** the initiative or **create** one (new `.md` + row in `_index.md`). See `.ai/protocols/startup.md` (step 4) and `.ai/protocols/review_bump.md` (Part A item 4, Part C gate).

---

## AI Guidelines

1. **Do NOT commit or deploy** unless explicitly told to do so.
2. **Do NOT push to remote** unless explicitly told to do so.
3. **Do NOT create documentation files** unless asked.
4. **Do NOT amend commits** unless the conditions in the system prompt are met.
5. **Use timestamps** (ISO 8601, America/Chicago timezone) on all documentation updates.
6. **Load `.ai/extended/<domain>.md` only when the task touches that domain** — filenames are self-explanatory (e.g. `backend.md`, `inventory-pipeline.md`). Do not read all extended files at once.
7. **Follow protocols** in `.ai/protocols/` (`startup.md`, `review_bump.md`). **Initiative lifecycle** (`activate_initiative`, `move_initiative_to_*`) — [`.ai/initiatives/_archived/_protocols/README.md`](initiatives/_archived/_protocols/README.md). **Initiatives** live in `.ai/initiatives/` (`_index.md` for active; `_archived/ARCHIVE.md` for the archive catalog).
8. **Initiatives vs releases** — Tie substantial work and **version bumps** to **named initiatives** when possible; **patch/minor/major** still follows product semver (see `_index.md`). If initiative scope is **ambiguous**, ask the user or add an initiative — do not guess.
9. **Initiative archiving** — Do **not** move an initiative to `.ai/initiatives/_archived/` unless the **user explicitly** approves or instructs. **Ask** before archiving.
10. **Verify before changing** — read files before editing, check lints after editing.
11. **Use the workspace/** folder for any scratch files, test scripts, or notebooks.

---

## How to Maintain Project Docs

### Documentation lives here:

- **`.ai/`** — AI-oriented steering: `context.md`, `protocols/`, `initiatives/`, **`extended/`** (domain deep-dives, `development.md`, database routing, retag ops). No separate `docs/` tree.
- **`workspace/`** — Local scratch, notebook outputs, optional side-project notes (gitignored except whitelisted notebook paths).

### Maintenance rules:

- When you change backend models, update `.ai/extended/backend.md` when that file is used for the domain.
- When you add/change API endpoints or routes, update the relevant `.ai/extended/*.md` file or `context.md` “Current State”.
- When you change auth or permissions, update `.ai/extended/auth-and-roles.md`.
- When you add or rename databases / connection patterns, update `.ai/extended/databases.md` (never put secrets in `.ai/`).
- When releasing a new version, bump repo root `.version`, bump root `package.json` `"version"` to match (numeric semver), and add an entry to repo root `CHANGELOG.md`. Anchor **major/minor/patch** in user-visible/API changes; link shipped work to **initiatives** in `_index.md` where applicable (see `.ai/protocols/review_bump.md` Part C). If the initiative in scope is unclear, resolve that before bumping.
- Always update the `<!-- Last updated: ... -->` timestamp at the top of any file you modify.
- When you edit an `.ai/extended/*.md` file, update its top timestamp.
- Review docs freshness periodically using `.ai/protocols/review_bump.md` (Part A–B).

---

## Quick Reference

| Need | Where |
|------|-------|
| Tech stack and architecture | `.ai/context.md`, `.ai/extended/frontend.md` / `backend.md` as needed |
| Database schema (Django / DB3) | `apps/*/models.py`, `.ai/extended/databases.md` |
| Multi-DB overview (DB1/2/3) | `.ai/extended/databases.md` |
| Local DB audit exports (optional) | `workspace/database-audits/` (gitignored) |
| Jupyter multi-DB notebooks | `workspace/notebooks/` (see `_shared/README.md` for setup) |
| Setup and dev guide | `.ai/extended/development.md` |
| Current version | Repo root `.version` |
| Version history | Repo root `CHANGELOG.md` |
| Initiatives (active, on hold, backlog) | `.ai/initiatives/_index.md` |
| Archived initiatives (historical) | `.ai/initiatives/_archived/ARCHIVE.md` |
| Deep-dive context | `.ai/extended/*.md` (load by domain) |
| Protocols | `.ai/protocols/startup.md`, `review_bump.md`; initiative lifecycle — `.ai/initiatives/_archived/_protocols/README.md` |
| Dev scripts (repo) | `scripts/dev/` |
| Personal scratch | `workspace/` (mostly gitignored) |
| E2E test templates | `workspace/testing/` (tracked checklist + README) |

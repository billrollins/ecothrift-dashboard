<!-- Last updated: 2026-07-31 (online_sales_mvp v2.62.0 shipped parked) -->
# Eco-Thrift Dashboard — AI Context

## Project Summary

Eco-Thrift Dashboard is a full-stack business management application for a thrift store in Omaha, NE. It covers HR (time clock, sick leave), inventory (vendors, purchase orders, item processing), point-of-sale (registers, drawers, carts, receipts), consignment (agreements, payouts), and an admin dashboard. Built with Django 5.2 + DRF on the backend and React 18.3 + TypeScript + MUI v7 on the frontend. PostgreSQL database. Deployed to Heroku.

## Release and version (repo root only)

- **Current tag:** read [`.version`](../.version) — do **not** duplicate semver history in this file.
- **What shipped / WIP:** read [`CHANGELOG.md`](../CHANGELOG.md) (latest dated section + `[Unreleased]`).
- **Production pushes:** every deploy warrants a semver bump and `CHANGELOG` entry ([`review.0.Bump.md`](protocols/review.0.Bump.md)).

## Active work (compass)

- **Active — Online Sales MVP:** [`online_sales_mvp`](initiatives/online_sales_mvp.md) — **v2.62.0** shipped with staff workspace live and public surface **parked** (`ONLINE_SALES_ENABLED=false` until owner says go). Gates G2–G8 accepted; G9 resolved as **Microsoft Graph** on `retail@` (no third-party provider, no SPF change). Next: listing-entry polish + shared TipTap editor (v2.63), then two-way M365 mail (v2.64). Narrows parked [`online_sales_workspace`](initiatives/_archived/_pending/online_sales_workspace.md).
- **Retail QA submission reliability (shipped):** archived [`retail_qa_submission_reliability`](initiatives/_archived/_completed/retail_qa_submission_reliability.md) — stranded-draft recovery, autosave/resume, +/- grades, dashboard deep links, 8-week grids. **v2.60.0–v2.61.0**. Photo S3 deferred.
- **Delivery Mobile Ops (shipped):** archived [`delivery_mobile_operations_completion`](initiatives/_archived/_completed/delivery_mobile_operations_completion.md) — Desk + Field, Routes API, evidence/SMS, add/adjust, route maps, change history. **v2.55.0–v2.59.1**.
- **POS discount + delivery (shipped):** archived [`pos_discount_and_delivery`](initiatives/_archived/_completed/pos_discount_and_delivery.md) — terminal discount/delivery, printables, **Deliveries board**; **v2.51.0** schedule-later; **v2.52.0** unified Day Board (calls → route → load → drive → return on the same cards).
- **Parked — Online Sales Workspace:** [`online_sales_workspace`](initiatives/_archived/_pending/online_sales_workspace.md) — code retained; staff workspace + public holds **disabled** (`ONLINE_SALES_ENABLED=false`). Contract: [`.ai/reference/online_sales_workspace/phase_0_contract.md`](reference/online_sales_workspace/phase_0_contract.md).
- **Parked — TARS decision guardrails:** [`tars_full_instruction_wizard_guidance`](initiatives/_archived/_pending/tars_full_instruction_wizard_guidance.md) — Studio at `/restoration/tars` **kept available**; floor validation + Phase 2/3 deferred. Contract: [`standalone_studio_contract.md`](reference/TARS%20Restoration%20Processing%20App/standalone_studio_contract.md).
- **Custom Label Studio (shipped):** archived [`custom_label_studio`](initiatives/_archived/_completed/custom_label_studio.md) — Admin **`/admin/label-studio`**: PDF + visual templates, variables/increment, QR/Code128, AI Create, print × N; print-server **1.4.1**. Shipped **v2.48.0**–**v2.48.2**.
- **Floorplan builder (shipped):** archived [`floorplan_builder`](initiatives/_archived/_completed/floorplan_builder.md) — **`/floor-ops/floorplans`** editor + DB element kinds, walls/cut/print. Shipped **v2.39.0**–**v2.47.0**. Docs: **`apps/floorplan/README.md`**.
- **Retail Quality Audit MVP (shipped):** archived [`retail_quality_audit`](initiatives/_archived/_completed/retail_quality_audit.md) — Admin hub + mobile wizard; editable forms; dashboard grade. Shipped **v2.38.0** / **v2.43.0**.
- **Parked — TARS Restoration:** [`.ai/initiatives/_archived/_pending/tars_restoration_workspace.md`](initiatives/_archived/_pending/tars_restoration_workspace.md) — TARS Studio at `/restoration/tars` (Phases 0–2 + hardening **v2.39.0**); Processing Queue nav removed in favor of Restorations hub. **Resume when:** Phase 3 execute workflows + Phase 4 steering.
- **HR Time Clock (shipped):** archived [`hr_time_clock_mvp`](initiatives/_archived/_completed/hr_time_clock_mvp.md) — time clock, **Employees**, **Time & payroll**, soft delete; legacy HR pages removed. Shipped **v2.33.0**–**v2.33.1**.
- **Product/Item CRUD → Processing (shipped):** archived [`product_item_crud_and_processing`](initiatives/_archived/_completed/product_item_crud_and_processing.md) — **v2.29.0–v2.32.0** (Catalog, processing integration, unmanifested lines). Semantic embedding search on hold.
- **AI cleanup (shipped):** archived [`preprocessing_ai_cleanup_review`](initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md) — Step 2 **Run AI Cleanup** browser batch pool (`ai-cleanup-batch`/`-status`/`-complete`), chunked offline apply, gthread Procfile, legacy `ai-cleanup-rows` 410. Shipped **v2.28.0**.
- **Blog Studio (shipped):** archived [`blog_studio`](initiatives/_archived/_completed/blog_studio.md) — Super Admin **Blog Studio** (`/blog-studio`, lazy TipTap, opens in a new window) + DB-backed public blog (`apps.blog` at `/api/blog/`). Shipped **v2.27.0**–**v2.27.2**. One-time prod ops (if not done): `python manage.py seed_initial_blog_posts` (idempotent).
- **Parked — public site launch:** [`.ai/initiatives/_archived/_pending/public_website.md`](initiatives/_archived/_pending/public_website.md) — storefront **Phases 0–4 shipped** (**v2.26.0**, `frontend-public/` + `apps.webstore`). **Resume when:** deploy to Heroku + prod `seed_shop_categories`; wire **Helcim + email** after vendor conversations. Hostname routing: `ecothrift.us`/`www` → public SPA, `dash.*` → staff.
- **Staff UI (shipped):** [`web_ui_cleanup`](initiatives/_archived/_completed/web_ui_cleanup.md) **v2.25.0**.
- **Inbound intake (shipped):** archived [order_processing_pipeline_rebuild](initiatives/_archived/_completed/order_processing_pipeline_rebuild.md) (**v2.20.0**–**v2.24.2**); reference [`.ai/reference/order_processing_pipeline_rebuild/`](reference/order_processing_pipeline_rebuild/README.md); behavior in **`.ai/extended/inventory-pipeline.md`**.
- **Buying / B-Stock:** live API guardrails in workspace rules; detail in [`.ai/extended/bstock.md`](extended/bstock.md).

### Hidden UI (`web_ui_cleanup` — nav removed, routes remain)

Owner decision **2026-05-30** ([`web_ui_cleanup_section_pass.txt`](reference/web_ui_cleanup_section_pass.txt)). **Sidebar entries removed**; direct URL still works if bookmarked.

| Area | Hidden from nav | Routes |
|------|-----------------|--------|
| **Consignment (staff)** | Accounts, Items, Payouts (+ account detail) | `/consignment/accounts`, `/consignment/accounts/:id`, `/consignment/items`, `/consignment/payouts` |

**HR (Essentials):** Time clock. **Admin:** Employees (user/role CRUD + pay rate), Permissions, **Time & payroll** (superuser — roster, payroll summary, change requests). **Consignee portal** (`/consignee/*`) unchanged.

### Removed UI (`web_ui_cleanup` + `hr_time_clock_mvp`)

Legacy HR pages deleted **2026-06-22** (`TimeHistoryPage`, `EmployeeListPage`, `EmployeeDetailPage`, `SickLeavePage`). Routes `/hr/time-history`, `/hr/employees`, `/hr/sick-leave` redirect.

### Removed UI (`web_ui_cleanup` — routes + pages deleted)

Frontend routes/pages removed **2026-05-30**; **backend APIs retained** (harmless if unused).

| Removed | Was |
|---------|-----|
| `/inventory/admin/categories` | Categories roadmap placeholder |
| `/inventory/legacy`, `/inventory/legacy/orders`, `/inventory/admin/legacy` | Legacy inventory hub |
| `/inventory/processing-legacy` | Legacy batch processing grid + settings modal |
| `/inventory/products` | Product list page |
| `/inventory/templates` | Manifest templates splash |
| `/pricing`, `/pricing/:sku?` | Public SKU lookup page |

Template and product **APIs** still used by preprocessing / Item Processor — see **`.ai/extended/inventory-pipeline.md`**.

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
│   ├── consignment/        Agreements, consignment items, payouts
│   ├── buying/             B-Stock auction intelligence (models, scraper, staff REST + React /buying/*)
│   ├── webstore/           Public storefront catalog + orders/checkout (/api/webstore/)
│   └── blog/               Blog Studio + DB-backed public blog (/api/blog/, Super Admin)
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
├── scripts/                Committed dev/deploy automation — **`dev/start_dashboard.bat`**, **`dev/start_mobile_dashboard.bat`**, **`dev/start_website.bat`** (see `.ai/extended/development.md`)
├── efforts/                Optional per-effort handoffs (`<slug>/CONTEXT.md`) — read after startup when continuing that thread; see `efforts/README.md`
├── .ai/                    AI steering — see `.ai/README.md`
│   ├── README.md           Load order and folder roles
│   ├── context.md          Primary compass (this file)
│   ├── protocols/          Agent workflows (startup, bump, push, deep dive, close)
│   ├── initiatives/        Plans + sessions (`_index.md`; `_archived/` lifecycle)
│   ├── extended/           Domain deep-dives on demand; **`sql/`** → `schema.csv`
│   └── reference/          Purpose-organized specs, mockups, deep-dive output
├── workspace/              Temp artifacts, notebooks, side projects (almost all gitignored); consultant flat drops under **`to_consultant/files-update/`** (see **`extended/consultant_handoff.md`**); AI usage **`logs/ai_usage.jsonl`**; manifest dev logs under **`b-manifest-api/`**
│   └── notebooks/_shared/requirements-notebooks.txt  Optional Jupyter/DB + ML deps (see **`extended/development.md`**)
├── project design/         Original build specification (historical reference)
├── .version                Single-line app semver (vMAJOR.MINOR.PATCH)
├── CHANGELOG.md            Version-level changelog (repo root)
├── requirements.txt        Python dependencies
├── .env                    Local environment variables (gitignored)
└── .gitignore
```

---

## Extended docs — `.ai/extended/` TOC

Domain deep-dives loaded **on demand** (do not read all at session start). Each file is the authoritative reference for its domain.

| File | Domain | Description |
|------|--------|-------------|
| [`auth-and-roles.md`](extended/auth-and-roles.md) | Auth | JWT flow (httpOnly refresh + in-memory access), roles, permissions, password flows |
| [`backend.md`](extended/backend.md) | Backend | Django apps, models, serializers, API patterns, HR, AI proxy, management commands |
| [`bstock.md`](extended/bstock.md) | Buying | B-Stock API surface, scraper (parallel sweep, optional SOCKS5), auth, manifest pagination notes (aligned with `apps/buying/services/scraper.py`) |
| [`cash-management.md`](extended/cash-management.md) | POS | Cash drops, pickups, drawer reconciliation, safe counts |
| [`consignment.md`](extended/consignment.md) | Consignment | Agreements, consignment items, payouts, consignee portal |
| [`consultant_handoff.md`](extended/consultant_handoff.md) | AI / ops | Flat **`workspace/to_consultant/files-update/`** bundle; mid-session advisor snapshot |
| [`databases.md`](extended/databases.md) | Data | Three-generation DB overview (V1/V2/V3), `search_path`, Django test DB uses `public`, `.env` keys |
| [`development.md`](extended/development.md) | Dev ops | Dev setup, **`scripts/dev/`** (`start_dashboard`, `start_mobile_dashboard`, `start_website`), environment, logging, Heroku Scheduler |
| [`frontend.md`](extended/frontend.md) | Frontend | React 18.3 + TS + MUI v7, pages, components, routing, React Query hooks |
| [`inventory-pipeline.md`](extended/inventory-pipeline.md) | Inventory | PO processing, M3 pipeline, preprocessing, manifest templates, fast-cat |
| [`pos-system.md`](extended/pos-system.md) | POS | Registers, drawers, carts, transactions, terminal UI, receipt flow |
| [`print-server.md`](extended/print-server.md) | Print | Local FastAPI print server — labels, receipts, drawer kick, Windows installer |
| [`retag-operations.md`](extended/retag-operations.md) | Inventory | Retag v2 day-of and post-cutover ops; cleanup instructions for temp models |
| [`sql/README.md`](extended/sql/README.md) | SQL / pgAdmin | **`inventory_daily_migration.sql`** (v4 → **`daily_migration.csv`** flat cols); **`inventory_summary.sql`**; **`schema_columns_ecothrift.sql`** → **`schema.csv`** + **[`cli.md`](extended/sql/cli.md)** (`psql` / `dbshell`) |
| [`ux-spec.md`](extended/ux-spec.md) | UI/UX | Design philosophy, color system, typography, spacing, interaction patterns, component specs — authoritative reference for all pages |
| [`vpn-socks5.md`](extended/vpn-socks5.md) | Proxy / VPN | PIA SOCKS5 setup, `.env` keys, `socks5://` vs `socks5h://`, diagnostics, IP rotation, troubleshooting |

**Maintenance rule:** When you **add, rename, or remove** a file in `.ai/extended/`, update this table. See **How to Maintain Project Docs** below.

---

## Current State

### Working

Capability summary — detail lives in the extended docs above and initiative files; do not duplicate long feature lists here.

- **Accounts / auth:** JWT, roles, password flows
- **HR:** Time clock (Essentials), **Employees** + **Time & payroll** (Super Admin); sick leave models/API exist but no staff UI since MVP rebuild — see archived [`hr_time_clock_mvp`](initiatives/_archived/_completed/hr_time_clock_mvp.md) (**v2.33.0**–**v2.33.1** shipped; Session 3 week-hours/OT polish in **`[Unreleased]`**)
- **Inventory:** POs, M3 processing, preprocessing (standard manifest; Step 2 **AI Cleanup** — primary **`WebAiCleanupPanel`** batch pool via **`POST …/ai-cleanup-batch/`** + **`ai-cleanup-complete`**; offline Grok CSV under **Advanced** with **50-row chunked** **`apply-cleanup-csv`** (`partial: true`); legacy **`ai-cleanup-rows`** **410** on staging — **v2.28.0**, see [`preprocessing_ai_cleanup_review`](initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md)); **Final Decisions** step 3 with product match; **`finalize-preprocessing`** → **`ProcessingRow`** — **v2.21.0**); **Item Processor** (**`/inventory/processing/:id`**) — paginated **`processing-workspace`** (**`ProcessingRow.search_string`** / list **`searchString`** — **v2.23.0**), lazy **`processing-row-detail`** (**v2.22.1** — slim **`PurchaseOrder`** queryset on server + no **`manifest_rows`** prefetch on **`GET …/orders/{id}/`**; UI loads detail on row click only, **`useProcessingRowDetail`** no retry churn), mutation payloads **row-first** (**`processing_row_id` / `processing_row_ids`** on dispute / merge / bulk disposition / print-multiple — **v2.22.0**), read-only **Manifest pricing audit** (**`GET …/manual-review/`**); **`processing-swap` not shipped**; **Session 10 (v2.28.0)** — **P7 collapse groups** (`ProcessingRow.collapse_master` migration 0059, `processing-collapse-rows`/`-uncollapse-rows`, fill-in-order master check-in, group-aware master `queue_status` + `collapsedGroup` rollups + `effectiveRowQty` on every qty surface) and **P8 check-in/add-item overhaul** (buttons-first `ProcessingCheckInDialog` + `GET products/{id}/usage/` blast-radius warning, `QuickCheckInProductPrompt` new-vs-existing, row-defaults-at-top detail, ONE add-item model — workspace dialog hosts `ItemForm`, **`POST /items` quantity-aware** routing workspace POs through `processing_add_item`; **no 500 check-in cap** — >100 units confirm via `LargeCheckInConfirmDialog` (type **`PRINT <qty>`** when printing), 10k backstop 400s); see **`inventory-pipeline.md`** and **`CHANGELOG`**); **v2.12.0** — item list **pagination `count`** cache (`item_list_total_count`); **v2.14.0** — **`Item.cost`** from **`PurchaseOrder.est_shrink`** + listing retail (intake / PO save); backfill **`recompute_all_item_costs`**; legacy cost-pipeline management commands **removed** (see **[2.14.0]**)
- **POS:** Terminal, drawers, carts, transactions, cash management
- **Consignment:** Agreements, items, payouts, portal
- **Buying (B-Stock):** Phases 1–5 + 4.1A/4.1B shipped; **v2.19.0** — auction thumbs **per user** (**`my_thumbs_up`**, **`thumbs_up_count`**; **`AuctionThumbsVote`**; migration **`0020_remove_auction_thumbs_up`**) — **CHANGELOG [2.19.0]**; staff **category-want** vote API/model/UI **removed** **2026-04** (see **`apps/buying/migrations/0016_remove_categorywantvote.py`**); **v2.15.3** — **AI title estimate yield** (no `title_echo`; padded cached system block) + `estimate_auction_categories --missing-both` — **CHANGELOG [2.15.3]**; **v2.15.2** — **Retail-weighted manifest mix** + Mixed-lot AI blend + uncapped sweep AI — **CHANGELOG [2.15.2]**; **v2.15.1** — **Manifest pipeline optimizations** (session reuse, stats preload, annotation, prefetch, batch_size, lower delay, dev timelog/benchmark) — **CHANGELOG [2.15.1]**; **v2.15.0** — **Auction detail UX v3** (decision-flow layout: urgency strip, decision summary, bid reference card, multi-tick gauge, costs I/O split, sell-through/condition color coding, compact manifest — see **`.ai/extended/ux-spec.md`**); **v2.14.0** — **`CategoryStats.need_score_1to99`**, auction **`need_score`/`priority`** (1–99 mix); **v2.14.1** — SOCKS5 hardened for all B-Stock HTTP — **`.ai/extended/vpn-socks5.md`**; prior UI/sweep releases **v2.12.1** / **v2.13.0** / **v2.13.1** — [CHANGELOG](../CHANGELOG.md); **Phase 6** (outcome tracking) next
- **Data backfill (V1/V2 → V3):** Complete (v2.10.0); initiative **[archived](initiatives/_archived/_completed/data_backfill_initiative.md)** — loaders `backfill_phase1_*` … `backfill_phase5_categories` + `classify_v2_iterate`; **production DB** populated (through **v2.12.0** train); optional **`--database production`** on inventory pipeline commands. Portable CSV **`import_backfill`** to other hosts remains a separate path if ever needed.
- **Print server:** Local FastAPI labels/receipts/drawer
- **AI:** Claude proxy (`apps/ai/`), inventory/buying AI
- **Core / ops:** Locations, settings, S3, dev logging
- **28+** React pages; TypeScript + Vite production build green; eight Django apps with CRUD where applicable.

### Known Issues
- **Inventory — acquisition cost:** `Item.retail_value` holds vendor/manifest retail. **`Item.cost`** is allocated per PO using **`PurchaseOrder.est_shrink`** and listing **`retail_value`** (see **`apps/inventory/models.py`** / **`.ai/extended/backend.md`**). **Category need** panel uses **`CategoryStats.need_score_1to99`** (1–99, daily SQL) plus **`avg_cost`** / profit / ROC for display; mixed window semantics — see **`apps/buying/services/category_need.py`**. For legacy loads after **`populate_item_retail_value`**, run **`recompute_all_item_costs`** once if costs are missing.
- **Buying — `DELETE manifest` edge case:** A CSV uploaded against the wrong marketplace can leave **`CategoryMapping`** rows with a misleading prefix after manifest rows are removed; **`DELETE …/manifest/`** TODO in **`api_views.py`** tracks future admin tooling (**not** blocking).
- **`anthropic` package must be installed in venv**: `pip install anthropic` in the venv. The import is lazy (won't crash server if missing) but AI features won't work without it.
- Recharts ResponsiveContainer may log a width/height warning on initial render (cosmetic, does not affect functionality)
- Large JS bundle (~1.7MB) — could benefit from code splitting via lazy routes
- POS cash completion path should be hardened for malformed numeric payloads (e.g., `change_given` string coercion edge cases)

### Not Yet Implemented
- **Buying — auction won → `PurchaseOrder`:** There is **no** database link between **`Auction`** and **`PurchaseOrder`** today. Intended direction: when an auction is **won**, **create a PO** (or equivalent) and **reuse manifest data already stored** in the dashboard — **no** redundant B-Stock manifest download for that flow. Item cost then follows the normal PO / **`Item.cost`** path (**`.ai/extended/backend.md`** — Item acquisition cost). Not implemented.
- Email notifications (forgot-password tokens are returned in response, not emailed)
- Broad automated test suite (POS cart totals regression tests exist under `apps/pos/tests/`; most domains still lack coverage)
- Pricing ML model not yet trained — requires running `import_historical_sold` then `train_price_model` after retag day
- `backfill_categories` not yet run — run after retag cleanup to improve pricing model accuracy
- **Buying Phase 6:** outcome tracking (hammer, fees, per-line results) — see [bstock initiative (archived)](initiatives/_archived/_completed/bstock_auction_intelligence.md)

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

**Initiatives and versioning:** **Major, minor, and patch** bumps (repo `.version`, root `package.json`, `CHANGELOG.md`) follow **user-visible behavior and API contract** — not a 1:1 rule with initiative files (see `_index.md` under “CHANGELOG, `.version`, and releases”). Even so, **shipping work should stay traceable to named initiatives** in `_index.md` unless the change is explicitly outside that model (e.g. hotfix). If an AI session or a **session_close** pass cannot tell **which initiative** is being worked on or released, that is a **process gap**: the user should **name** the initiative or **create** one (new `.md` + row in `_index.md`). See `.ai/protocols/code.0.Startup.md` (steps 4 and 8) and `.ai/protocols/session.9.Close.md` Part 2 (version bump gate).

**Priorities and backlog:** **[`.ai/initiatives/_index.md`](initiatives/_index.md)** lists active initiatives; **[`.ai/initiatives/_archived/ARCHIVE.md`](initiatives/_archived/ARCHIVE.md)** catalogs completed, pending, backlog, and abandoned work.

---

## AI Guidelines

1. **Do NOT commit or deploy** unless explicitly told to do so.
2. **Do NOT push to remote** unless explicitly told to do so.
3. **Do NOT create documentation files** unless asked.
4. **Do NOT amend commits** unless the conditions in the system prompt are met.
5. **Use timestamps** (ISO 8601, America/Chicago timezone) on all documentation updates.
6. **Load `.ai/extended/<domain>.md` only when the task touches that domain** — use the **Extended docs TOC** above. Do not read all extended files at once. **Plans** live in **`.ai/initiatives/`** only (no `.ai/plans/`).
7. **Follow protocols** in `.ai/protocols/` (`code.0.Startup.md`, **`sql.0.UpdateSchema.md`** (refresh **`.ai/extended/sql/schema.csv`**), `session.0.Create.md` placeholder, `session.1.Checkpoint.md`, `code.1.Bearing.md`, `review.0.Bump.md` for docs audit + semver + `CHANGELOG` slice, `code.9.Push.md` when bump + GitHub push via `2_push_github.bat`, `review.9.Deep.md` for full repo/context audits and report generation, `session.9.Close.md` at end of session). **Consultant flat bundle / rotation:** [`.ai/extended/consultant_handoff.md`](extended/consultant_handoff.md). **Cadence:** **`session.1.Checkpoint.md`** several times per session; **`session.9.Close.md`** at the end / before commit. **Initiative lifecycle** (`activate_initiative`, `move_initiative_to_*`) — [`.ai/initiatives/_archived/_protocols/README.md`](initiatives/_archived/_protocols/README.md). **Initiatives** live in `.ai/initiatives/` (`_index.md` for active; `_archived/ARCHIVE.md` for the archive catalog).
8. **Initiatives vs releases** — Tie substantial work and **version bumps** to **named initiatives** when possible; **patch/minor/major** still follows product semver (see `_index.md`). If initiative scope is **ambiguous**, ask the user or add an initiative — do not guess.
9. **Initiative archiving** — Do **not** move an initiative to `.ai/initiatives/_archived/` unless the **user explicitly** approves or instructs. **Ask** before archiving.
10. **Verify before changing** — read files before editing, check lints after editing.
11. **Use the workspace/** folder for any scratch files, test scripts, or notebooks.

---

## How to Maintain Project Docs

### Documentation lives here:

- **`.ai/`** — AI steering: [`README.md`](README.md), `context.md`, `protocols/`, `initiatives/` (the plan), `extended/`, `reference/`. No separate `docs/` tree. **Version/changelog** only at repo root.
- **`workspace/`** — Local scratch, notebook outputs, optional side-project notes (gitignored except whitelisted notebook paths).

### Maintenance rules:

- When you change backend models, update `.ai/extended/backend.md` when that file is used for the domain.
- When you add/change API endpoints or routes, update the relevant `.ai/extended/*.md` file or `context.md` “Current State”.
- When you change auth or permissions, update `.ai/extended/auth-and-roles.md`.
- When you add or rename databases / connection patterns, update `.ai/extended/databases.md` (never put secrets in `.ai/`).
- **When you add, rename, or remove a file in `.ai/extended/`:** update the **Extended docs TOC** in this file.
- **Heroku Scheduler / buying background jobs:** When schedules change, update **`.ai/extended/development.md`** and root **`CHANGELOG.md`** `[Unreleased]` if user-visible.
- When releasing: bump repo root `.version`, root `package.json` `"version"`, and add a dated section to **`CHANGELOG.md`** only (see `.ai/protocols/session.9.Close.md` Part 2). Link shipped work to initiatives in `_index.md` where applicable.
- Always update the `<!-- Last updated: ... -->` timestamp at the top of any file you modify.
- When you edit an `.ai/extended/*.md` file, update its top timestamp.
- During work: keep **`[Unreleased]`** and session updates current with `.ai/protocols/session.1.Checkpoint.md`. Before commit: scoped doc updates in `.ai/protocols/session.9.Close.md` Part 2.

---

## Quick Reference

| Need | Where |
|------|-------|
| Tech stack and architecture | `.ai/context.md` (this file) |
| Domain deep-dives | `.ai/extended/` — see **Extended docs TOC** above |
| Database schema (Django / DB3) | `apps/*/models.py` |
| Current version | Repo root `.version` |
| Version history | Repo root `CHANGELOG.md` |
| Initiatives (active) | `.ai/initiatives/_index.md` |
| Archived initiatives | `.ai/initiatives/_archived/ARCHIVE.md` |
| `.ai/` layout | `.ai/README.md` |
| Reference artifacts | `.ai/reference/README.md` |
| Protocols | `.ai/protocols/` — `code.0.Startup.md`, **`sql.0.UpdateSchema.md`**, `session.1.Checkpoint.md`, `code.1.Bearing.md`, `review.0.Bump.md`, `code.9.Push.md`, `review.9.Deep.md`, `session.9.Close.md`; optional advisor bundle — `.ai/extended/consultant_handoff.md`; initiative lifecycle — `.ai/initiatives/_archived/_protocols/README.md` |
| Dev scripts | `scripts/dev/` — **`start_dashboard.bat`**, **`start_mobile_dashboard.bat`**, **`start_website.bat`** |
| Scratch / notebooks | `workspace/` (mostly gitignored) |
| E2E test templates | `workspace/testing/` |

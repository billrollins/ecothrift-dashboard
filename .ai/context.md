<!-- Last updated: 2026-04-12 (v2.11.1) -->
# Eco-Thrift Dashboard — AI Context

## Project Summary

Eco-Thrift Dashboard is a full-stack business management application for a thrift store in Omaha, NE. It covers HR (time clock, sick leave), inventory (vendors, purchase orders, item processing), point-of-sale (registers, drawers, carts, receipts), consignment (agreements, payouts), and an admin dashboard. Built with Django 5.2 + DRF on the backend and React 18.3 + TypeScript + MUI v7 on the frontend. PostgreSQL database. Deployed to Heroku.

**Current version:** See repo root `.version` (e.g. **`v2.11.1`**). **Historical data backfill** (Phases 0–6) is **complete** and the initiative is **archived** — **[`.ai/initiatives/_archived/_completed/data_backfill_initiative.md`](initiatives/_archived/_completed/data_backfill_initiative.md)**; **Heroku production** has V1/V2→V3 data, **`Item.retail_value`**, categories, and **cost pipeline** deployed (see **CHANGELOG [2.11.1]**). **Active initiative:** **B-Stock Phase 6** — **[`.ai/initiatives/bstock_auction_intelligence.md`](initiatives/bstock_auction_intelligence.md)** (outcome tracking); see also **`.ai/extended/backend.md`**, **`.ai/extended/frontend.md`**.

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
│   └── buying/             B-Stock auction intelligence (models, scraper, staff REST + React /buying/*)
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
│   ├── context.md          Primary agent context (read at session start)
│   ├── consultant_context.md  Single-file, dense handoff for external consultants (not a substitute for modular docs for coders)
│   ├── protocols/          startup.md, session_checkpoint.md, get_bearing.md, session_close.md, collect_for_consultant.md (initiative lifecycle stubs → initiatives/_archived/_protocols/)
│   ├── initiatives/        _index.md (active); _archived/ARCHIVE.md + buckets + _protocols/ (lifecycle how-tos)
│   ├── extended/           Deep-dive domain docs (load on demand — keeps agent context small)
│   ├── reference/          Third-party / external context (optional)
│   └── prototype/          Design prototypes and archived explorations
├── workspace/              Temp artifacts, notebooks, side projects (almost all gitignored); **`notes/to_consultant/extract_po_descriptions.py`** whitelisted for historical PO export; **`notes/archived/session_*`** holds session diagnostic bundles when rotated out of the working tree
│   └── notebooks/_shared/requirements-notebooks.txt  Optional Jupyter/DB + ML deps
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
| [`bstock.md`](extended/bstock.md) | Buying | B-Stock API surface, scraper endpoints, auth requirements, service map |
| [`cash-management.md`](extended/cash-management.md) | POS | Cash drops, pickups, drawer reconciliation, safe counts |
| [`consignment.md`](extended/consignment.md) | Consignment | Agreements, consignment items, payouts, consignee portal |
| [`databases.md`](extended/databases.md) | Data | Three-generation DB overview (V1/V2/V3), connection patterns, `.env` keys |
| [`development.md`](extended/development.md) | Dev ops | Dev setup, scripts, environment, logging, Heroku config |
| [`frontend.md`](extended/frontend.md) | Frontend | React 18.3 + TS + MUI v7, pages, components, routing, React Query hooks |
| [`inventory-pipeline.md`](extended/inventory-pipeline.md) | Inventory | PO processing, M3 pipeline, preprocessing, manifest templates, fast-cat |
| [`pos-system.md`](extended/pos-system.md) | POS | Registers, drawers, carts, transactions, terminal UI, receipt flow |
| [`print-server.md`](extended/print-server.md) | Print | Local FastAPI print server — labels, receipts, drawer kick, Windows installer |
| [`retag-operations.md`](extended/retag-operations.md) | Inventory | Retag v2 day-of and post-cutover ops; cleanup instructions for temp models |

**Maintenance rule:** When you **add, rename, or remove** a file in `.ai/extended/`, update this table **and** the matching table in `.ai/consultant_context.md`. See **How to Maintain Project Docs** below.

---

## Current State

### Working

Capability summary — detail lives in the extended docs above and initiative files; do not duplicate long feature lists here.

- **Accounts / auth:** JWT, roles, password flows
- **HR:** Time clock, sick leave, departments, time-entry requests
- **Inventory:** POs, M3 processing, preprocessing (standard manifest, AI cleanup, matching, pricing)
- **POS:** Terminal, drawers, carts, transactions, cash management
- **Consignment:** Agreements, items, payouts, portal
- **Buying (B-Stock):** Phases 1–5 + 4.1A/4.1B shipped (see `.version`); **Phase 6** (outcome tracking) next — see [bstock initiative](initiatives/bstock_auction_intelligence.md)
- **Data backfill (V1/V2 → V3):** Complete (v2.10.0); initiative **[archived](initiatives/_archived/_completed/data_backfill_initiative.md)** — loaders `backfill_phase1_*` … `backfill_phase5_categories` + `classify_v2_iterate`; **production DB** populated (v2.11.1); optional **`--database production`** on inventory pipeline commands. Portable CSV **`import_backfill`** to other hosts remains a separate path if ever needed.
- **Print server:** Local FastAPI labels/receipts/drawer
- **AI:** Claude proxy (`apps/ai/`), inventory/buying AI
- **Core / ops:** Locations, settings, S3, dev logging
- **28+** React pages; TypeScript + Vite production build green; eight Django apps with CRUD where applicable.

### Known Issues
- **Inventory — acquisition cost:** `Item.retail_value` holds vendor/manifest retail. **`Item.cost`** is populated by **`recompute_cost_pipeline`** (Heroku Scheduler: nightly on production). **Category need** (`build_category_need_rows`) uses **`avg_cost`**, **profit**, and **ROC** when costs exist; mixed window semantics (shelf all-time vs sold in pricing window) — see **`apps/buying/services/category_need.py`**. For new legacy loads: **`populate_item_retail_value`** then **`recompute_cost_pipeline`**.
- **Buying — `DELETE manifest` edge case:** A CSV uploaded against the wrong marketplace can leave **`CategoryMapping`** rows with a misleading prefix after manifest rows are removed; **`DELETE …/manifest/`** TODO in **`api_views.py`** tracks future admin tooling (**not** blocking).
- **AI manifest cleanup — concurrency > 1:** Default is **1** thread; higher values are experimental (progress, resume, and completion semantics are not fully hardened). Cancel increments a server-side generation so in-flight batches skip writes after **Cancel cleanup**.
- **`anthropic` package must be installed in venv**: `pip install anthropic` in the venv. The import is lazy (won't crash server if missing) but AI features won't work without it.
- Recharts ResponsiveContainer may log a width/height warning on initial render (cosmetic, does not affect functionality)
- Large JS bundle (~1.7MB) — could benefit from code splitting via lazy routes
- POS cash completion path should be hardened for malformed numeric payloads (e.g., `change_given` string coercion edge cases)

### Not Yet Implemented
- Email notifications (forgot-password tokens are returned in response, not emailed)
- Broad automated test suite (POS cart totals regression tests exist under `apps/pos/tests/`; most domains still lack coverage)
- Pricing ML model not yet trained — requires running `import_historical_sold` then `train_price_model` after retag day
- `backfill_categories` not yet run — run after retag cleanup to improve pricing model accuracy
- **Buying Phase 6:** outcome tracking (hammer, fees, per-line results) — see [bstock initiative](initiatives/bstock_auction_intelligence.md)

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

**Initiatives and versioning:** **Major, minor, and patch** bumps (repo `.version`, root `package.json`, `CHANGELOG.md`) follow **user-visible behavior and API contract** — not a 1:1 rule with initiative files (see `_index.md` under “CHANGELOG, `.version`, and releases”). Even so, **shipping work should stay traceable to named initiatives** in `_index.md` unless the change is explicitly outside that model (e.g. hotfix). If an AI session or a **session_close** pass cannot tell **which initiative** is being worked on or released, that is a **process gap**: the user should **name** the initiative or **create** one (new `.md` + row in `_index.md`). See `.ai/protocols/startup.md` (steps 4 and 8) and `.ai/protocols/session_close.md` Part 2 (version bump gate).

**Priorities and backlog:** **[`.ai/initiatives/_index.md`](initiatives/_index.md)** lists active initiatives; **[`.ai/initiatives/_archived/ARCHIVE.md`](initiatives/_archived/ARCHIVE.md)** catalogs completed, pending, backlog, and abandoned work.

---

## AI Guidelines

1. **Do NOT commit or deploy** unless explicitly told to do so.
2. **Do NOT push to remote** unless explicitly told to do so.
3. **Do NOT create documentation files** unless asked.
4. **Do NOT amend commits** unless the conditions in the system prompt are met.
5. **Use timestamps** (ISO 8601, America/Chicago timezone) on all documentation updates.
6. **Load `.ai/extended/<domain>.md` only when the task touches that domain** — use the **Extended docs TOC** above to pick the right file. Do not read all extended files at once. **`.ai/initiatives/`** and **`.ai/extended/`** are **modular** on purpose so coding sessions do not load irrelevant context. **External consultants** needing one **full** narrative should use **`.ai/consultant_context.md`** (dense, all-in-one) rather than reading every extended file.
7. **Follow protocols** in `.ai/protocols/` (`startup.md`, `session_checkpoint.md`, `get_bearing.md`, `session_close.md`, `collect_for_consultant.md`). **Cadence:** **`session_checkpoint`** several times per session; **`session_close`** at the end / before commit. **Initiative lifecycle** (`activate_initiative`, `move_initiative_to_*`) — [`.ai/initiatives/_archived/_protocols/README.md`](initiatives/_archived/_protocols/README.md). **Initiatives** live in `.ai/initiatives/` (`_index.md` for active; `_archived/ARCHIVE.md` for the archive catalog).
8. **Initiatives vs releases** — Tie substantial work and **version bumps** to **named initiatives** when possible; **patch/minor/major** still follows product semver (see `_index.md`). If initiative scope is **ambiguous**, ask the user or add an initiative — do not guess.
9. **Initiative archiving** — Do **not** move an initiative to `.ai/initiatives/_archived/` unless the **user explicitly** approves or instructs. **Ask** before archiving.
10. **Verify before changing** — read files before editing, check lints after editing.
11. **Use the workspace/** folder for any scratch files, test scripts, or notebooks.

---

## How to Maintain Project Docs

### Documentation lives here:

- **`.ai/`** — AI-oriented steering: `context.md`, **`consultant_context.md`** (single-file consultant handoff for topics it covers), `protocols/`, `initiatives/`, **`extended/`** (domain deep-dives, `development.md`, database routing, retag ops). No separate `docs/` tree.
- **`workspace/`** — Local scratch, notebook outputs, optional side-project notes (gitignored except whitelisted notebook paths).

### Maintenance rules:

- When you change backend models, update `.ai/extended/backend.md` when that file is used for the domain.
- When you add/change API endpoints or routes, update the relevant `.ai/extended/*.md` file or `context.md` “Current State”.
- When you change auth or permissions, update `.ai/extended/auth-and-roles.md`.
- When you add or rename databases / connection patterns, update `.ai/extended/databases.md` (never put secrets in `.ai/`).
- **When you add, rename, or remove a file in `.ai/extended/`:** update the **Extended docs TOC** table in **this file** (`context.md`) **and** the matching table in **`.ai/consultant_context.md`**. Both TOCs must list every file in `.ai/extended/`.
- When releasing a new version, bump repo root `.version`, bump root `package.json` `"version"` to match (numeric semver), and add an entry to repo root `CHANGELOG.md`. Anchor **major/minor/patch** in user-visible/API changes; link shipped work to **initiatives** in `_index.md` where applicable (see `.ai/protocols/session_close.md` Part 2). If the initiative in scope is unclear, resolve that before bumping.
- When B-Stock / buying advisory material changes in a way that would matter to an external advisor, update **`.ai/consultant_context.md`** in the same pass as the relevant initiative or `apps/buying/` behavior (keep it information-dense; see that file’s maintenance note).
- Always update the `<!-- Last updated: ... -->` timestamp at the top of any file you modify.
- When you edit an `.ai/extended/*.md` file, update its top timestamp.
- During work: keep **`[Unreleased]`** and session updates current with `.ai/protocols/session_checkpoint.md`. Before commit: scoped doc updates in `.ai/protocols/session_close.md` Part 2.

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
| Consultant handoff | `.ai/consultant_context.md` |
| Protocols | `.ai/protocols/` — `startup.md`, `session_checkpoint.md`, `get_bearing.md`, `session_close.md`, `collect_for_consultant.md`; initiative lifecycle — `.ai/initiatives/_archived/_protocols/README.md` |
| Dev scripts | `scripts/dev/` |
| Scratch / notebooks | `workspace/` (mostly gitignored) |
| E2E test templates | `workspace/testing/` |

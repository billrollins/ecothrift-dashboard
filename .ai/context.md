<!-- Last updated: 2026-09-02 (v2.77.0 Retail QA stabilize) -->
# Eco-Thrift Dashboard — AI Context

## Project Summary

Full-stack business management for a thrift store in Omaha, NE. HR (time clock, sick leave), inventory (vendors, POs, item processing), POS (registers, drawers, carts, receipts), consignment, buying (B-Stock), public storefront + Online Sales, restoration (TARS), admin. Django 5.2 + DRF, React 18.3 + TypeScript + MUI v7, PostgreSQL. Deployed to Heroku.

## Release and version (repo root only)

- **Current tag:** [`.version`](../.version) — do not duplicate semver here.
- **What shipped / WIP:** [`CHANGELOG.md`](../CHANGELOG.md) (latest dated section + `[Unreleased]`).
- **Pushes:** [`ship-push-git.md`](protocols/ship-push-git.md) bumps semver and pushes GitHub. [`ship-push-heroku.md`](protocols/ship-push-heroku.md) does that then Heroku. Prod shows `.version` via `GET /api/core/system/version/` and the sidebar footer.

## Active work

- **ACTIVE (compass) — Routines and Documents:** [`routines_and_documents`](initiatives/routines_and_documents.md) — Routines + Retail QA shipped **v2.76.0**, stabilized in **v2.77.0**. Documents API is in-tree; staff routes are unwired until a later UI tune. Replaces abandoned [`documents_and_duties`](initiatives/_archived/_abandoned/documents_and_duties.md).
- **ACTIVE — Admin workspace overhaul:** [`admin_workspace_overhaul`](initiatives/admin_workspace_overhaul.md) — Studios workspace, Settings house, capability catalog. Grants deferred.
- **ACTIVE — Universal object surfaces:** [`universal_object_surfaces`](initiatives/universal_object_surfaces.md) — design only. No code scheduled.

TARS and enhancement requests shipped **v2.71.0** (GitHub, not Heroku): [`finalize_tars_app`](initiatives/_archived/_completed/finalize_tars_app.md), [`enhancement_requests`](initiatives/_archived/_completed/enhancement_requests.md). Domain: [`extended/restoration.md`](extended/restoration.md).

Parked / shipped work lives in [`initiatives/_index.md`](initiatives/_index.md) and [`CHANGELOG.md`](../CHANGELOG.md).

## Hidden UI (`web_ui_cleanup`)

Sidebar entries removed. Consignment bookmarks still work. Documents routes are off until that UI is tuned.

| Area | Hidden from nav | Routes |
|------|-----------------|--------|
| **Consignment (staff)** | Accounts, Items, Payouts (+ account detail) | `/consignment/accounts`, `/consignment/accounts/:id`, `/consignment/items`, `/consignment/payouts` |
| **Documents** | Account-menu link off. Pages stay in `frontend/src/pages/documents/`. | `/documents*` unwired — catch-all goes to Dashboard. Rewire when the UI is tuned. |

**HR (account menu):** Time clock, Routines. Digit 9 and letter L are free. **Admin:** Users (Employees first and default for Admin, Customers second; Managers only see Customers), Settings (System / Printing / Store / Assumptions / Retail QA / Permissions), Retail inbox (Admin), Time & payroll (superuser), Routines / Routine Control (superuser — Routines, Sections, Grades). **Studios:** Label Studio, Floorplans, Blog Studio. **Consignee portal** (`/consignee/*`) unchanged.

## File Map

```
ecothrift-dashboard/
├── ecothrift/              Django settings and root URLs
├── apps/                   accounts, ai, core, hr, inventory, pos, consignment, buying, webstore, blog, routines, documents
├── frontend/src/           Staff SPA (api, components, hooks, pages, App.tsx)
├── frontend-public/        Public storefront SPA
├── printserver/            Local FastAPI print server
├── scripts/                dev/start_dashboard.bat, start_mobile_dashboard.bat, start_website.bat
├── .ai/                    AI steering — see .ai/README.md
│   ├── context.md          This compass
│   ├── protocols/          clean-up, context-load, initiative-create, initiative-review, ship-push-git, ship-push-heroku
│   ├── initiatives/        Plan + _archived/
│   ├── extended/           Domain docs + sql/ + initiatives.md
│   └── reference/          tars/ + bookkeeping_recon.md
├── .version                Single-line app semver (vMAJOR.MINOR.PATCH)
├── CHANGELOG.md            Version-level changelog
├── .env                    Local config (gitignored)
└── .envprod                Heroku config mirror (gitignored)
```

## Environment files

**Exactly two env files exist, and neither is committed: `.env` and `.envprod`.** Edit them at the repo root. No example/template, no fragment layer.

| File | Role |
|------|------|
| **`.env`** | Local config. Django (`ecothrift/settings.py` via python-decouple) and Vite (`frontend/vite.config.ts`) both read it. |
| **`.envprod`** | Production values. `scripts/deploy/env/sync_to_heroku.bat` pushes it to Heroku Config Vars. Keep the shared bottom block identical to `.env`. |

The authoritative list of variable **names** is the Environment Variables table in [`development.md`](extended/development.md). When you need a value, read `.env` on disk. Never invent credentials, and never copy secrets into `.ai/`, committed files, or chat.

## Extended docs — `.ai/extended/` TOC

Load **on demand**. Do not read all at session start.

| File | Domain | Description |
|------|--------|-------------|
| [`auth-and-roles.md`](extended/auth-and-roles.md) | Auth | JWT flow, roles, permissions, password flows |
| [`backend.md`](extended/backend.md) | Backend | Django apps, models, serializers, API patterns |
| [`bstock.md`](extended/bstock.md) | Buying | B-Stock API, scraper, SOCKS5 |
| [`cash-management.md`](extended/cash-management.md) | POS | Drops, pickups, drawer reconciliation, safe |
| [`consignment.md`](extended/consignment.md) | Consignment | Agreements, items, payouts, portal |
| [`databases.md`](extended/databases.md) | Data | V1/V2/V3, `search_path`, `.env` DB keys |
| [`development.md`](extended/development.md) | Dev ops | Setup, starters, environment, logging, Scheduler, Graph mail |
| [`frontend.md`](extended/frontend.md) | Frontend | React + MUI, pages, routing, React Query |
| [`brand.md`](extended/brand.md) | Brand | Staff hex, same-colour-same-meaning, token files |
| [`initiatives.md`](extended/initiatives.md) | Initiatives | File layout, buckets, create / park / complete / abandon |
| [`routines.md`](extended/routines.md) | Routines | Periodic / on-demand fill-in forms, pooled runs, nag |
| [`documents.md`](extended/documents.md) | Documents | PDF upload, field placement, signing wizard, flatten |
| [`inventory-pipeline.md`](extended/inventory-pipeline.md) | Inventory | PO processing, M3, preprocessing, Item Processor |
| [`pos-system.md`](extended/pos-system.md) | POS | Registers, drawers, carts, terminal, receipts |
| [`print-server.md`](extended/print-server.md) | Print | Local FastAPI — labels, receipts, drawer kick |
| [`restoration.md`](extended/restoration.md) | TARS | RestorationJob, queue, bench, scoreboard, routes |
| [`ux-spec.md`](extended/ux-spec.md) | UI/UX | Color, typography, spacing, house rules |
| [`vpn-socks5.md`](extended/vpn-socks5.md) | Proxy | PIA SOCKS5 setup and diagnostics |
| [`sql/README.md`](extended/sql/README.md) | SQL | `schema.csv`, daily migration SQL, `cli.md` |

When you add, rename, or remove a file in `.ai/extended/`, update this table.

## Known Issues

- **Inventory — acquisition cost:** `Item.retail_value` is vendor/manifest retail. `Item.cost` is allocated per PO using `PurchaseOrder.est_shrink` and listing retail. Retag floor stock can have null cost — see [`reference/bookkeeping_recon.md`](reference/bookkeeping_recon.md).
- **Buying — `DELETE manifest` edge case:** wrong-marketplace CSV can leave misleading `CategoryMapping` prefixes after rows are removed.
- **`anthropic` package** must be in the venv for AI features (lazy import).
- Recharts ResponsiveContainer may log a width/height warning on first render (cosmetic).
- Large JS bundle (~1.7MB).
- POS cash completion should be hardened for malformed numeric payloads.

## Not yet implemented (live gaps)

- No DB link from won **Auction** → **PurchaseOrder**.
- Email notifications beyond Graph transactional mail (holds, magic links, and password resets are covered).
- Broad automated test suite (POS and restoration have coverage; most domains do not).
- Pricing ML model not trained. Buying Phase 6 (outcome tracking) not started.

## AI Guidelines

1. Do **not** commit, push, or deploy unless explicitly told.
2. Do **not** create documentation files unless asked (exception: this compass, initiatives, and extended files when the work changes them).
3. Use timestamps (`YYYY-MM-DD`, America/Chicago) on docs you edit.
4. Load `.ai/extended/<domain>.md` only when the task touches that domain.
5. Substantial work maps to a **named initiative**. If unclear, ask. Filing rules: [`extended/initiatives.md`](extended/initiatives.md). Do not archive without explicit approval.
6. Scratch files go in `workspace/`. Verify before changing; check lints after.

**Maintain:** change a domain → update that extended file. New env key → `.env` / `.envprod` + the table in `development.md`. **IF** the user attaches a protocol **THEN** run that protocol.

## Quick Reference

| Need | Where |
|------|-------|
| Compass | `.ai/context.md` (this file) |
| Clean-up | `.ai/protocols/clean-up.md` — if given, list then delete the paste-back |
| Load context | `.ai/protocols/context-load.md` — if given, do it |
| Create initiative | `.ai/protocols/initiative-create.md` — if given, interview then write |
| Review initiatives | `.ai/protocols/initiative-review.md` — if given, propose then apply the paste-back |
| Ship to GitHub | `.ai/protocols/ship-push-git.md` — if given, do it |
| Ship to Heroku | `.ai/protocols/ship-push-heroku.md` — if given, do it |
| Schema snapshot | `.ai/extended/sql/README.md` — Update schema |
| Initiative files | `.ai/extended/initiatives.md` |
| Env names | `.ai/extended/development.md` |
| Active plan | `.ai/initiatives/_index.md` |
| Version | `.version` + `CHANGELOG.md` |
| Dev starters | `scripts/dev/` |

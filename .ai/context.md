<!-- Last updated: 2026-08-25 (TARS + enhancement requests completed) -->
# Eco-Thrift Dashboard — AI Context

## Project Summary

Full-stack business management for a thrift store in Omaha, NE. HR (time clock, sick leave), inventory (vendors, POs, item processing), POS (registers, drawers, carts, receipts), consignment, buying (B-Stock), public storefront + Online Sales, restoration (TARS), admin. Django 5.2 + DRF, React 18.3 + TypeScript + MUI v7, PostgreSQL. Deployed to Heroku.

## Release and version (repo root only)

- **Current tag:** [`.version`](../.version) — do not duplicate semver here.
- **What shipped / WIP:** [`CHANGELOG.md`](../CHANGELOG.md) (latest dated section + `[Unreleased]`).
- **Pushes:** every GitHub push bumps semver ([`ship.md`](protocols/ship.md)). Prod shows `.version` via `GET /api/core/system/version/` and the sidebar footer.

## Active work

- **ACTIVE — Universal object surfaces:** [`universal_object_surfaces`](initiatives/universal_object_surfaces.md) — design only. No code scheduled.

TARS and enhancement requests shipped **v2.71.0** (GitHub, not Heroku): [`finalize_tars_app`](initiatives/_archived/_completed/finalize_tars_app.md), [`enhancement_requests`](initiatives/_archived/_completed/enhancement_requests.md). Domain: [`extended/restoration.md`](extended/restoration.md).

Parked / shipped work lives in [`initiatives/_index.md`](initiatives/_index.md) and [`CHANGELOG.md`](../CHANGELOG.md).

## Hidden UI (`web_ui_cleanup`)

Sidebar entries removed; direct URL still works if bookmarked.

| Area | Hidden from nav | Routes |
|------|-----------------|--------|
| **Consignment (staff)** | Accounts, Items, Payouts (+ account detail) | `/consignment/accounts`, `/consignment/accounts/:id`, `/consignment/items`, `/consignment/payouts` |

**HR (Essentials):** Time clock. **Admin:** Employees, Permissions, **Time & payroll** (superuser). **Consignee portal** (`/consignee/*`) unchanged.

## File Map

```
ecothrift-dashboard/
├── ecothrift/              Django settings and root URLs
├── apps/                   accounts, ai, core, hr, inventory, pos, consignment, buying, webstore, blog
├── frontend/src/           Staff SPA (api, components, hooks, pages, App.tsx)
├── frontend-public/        Public storefront SPA
├── printserver/            Local FastAPI print server
├── scripts/                dev/start_dashboard.bat, start_mobile_dashboard.bat, start_website.bat
├── .ai/                    AI steering — see .ai/README.md
│   ├── context.md          This compass
│   ├── protocols/          load-context, ship, initiative, sql-schema
│   ├── initiatives/        Plan + _archived/
│   ├── extended/           Domain docs + sql/
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
- Email notifications beyond Graph transactional mail (forgot-password tokens are not emailed).
- Broad automated test suite (POS and restoration have coverage; most domains do not).
- Pricing ML model not trained. Buying Phase 6 (outcome tracking) not started.

## AI Guidelines

1. Do **not** commit, push, or deploy unless explicitly told.
2. Do **not** create documentation files unless asked (exception: this compass, initiatives, and extended files when the work changes them).
3. Use timestamps (`YYYY-MM-DD`, America/Chicago) on docs you edit.
4. Load `.ai/extended/<domain>.md` only when the task touches that domain.
5. Substantial work maps to a **named initiative**. If unclear, ask. Do not archive an initiative without explicit approval.
6. Scratch files go in `workspace/`. Verify before changing; check lints after.

**Maintain:** change a domain → update that extended file. New env key → `.env` / `.envprod` + the table in `development.md`. Release → [`ship.md`](protocols/ship.md).

## Quick Reference

| Need | Where |
|------|-------|
| Compass | `.ai/context.md` (this file) |
| Load order | `.ai/protocols/load-context.md` |
| Ship / bump / push | `.ai/protocols/ship.md` |
| Initiative lifecycle | `.ai/protocols/initiative.md` |
| Env names | `.ai/extended/development.md` |
| Active plan | `.ai/initiatives/_index.md` |
| Version | `.version` + `CHANGELOG.md` |
| Dev starters | `scripts/dev/` |

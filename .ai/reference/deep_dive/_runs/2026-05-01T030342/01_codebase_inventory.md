# Codebase Inventory

## Executive Summary

- **Shipped product shape:** Django 5.2 monolith (`ecothrift/`) with eight domain apps under `apps/`; React 18 + TypeScript + Vite + MUI v7 SPA under `frontend/`; optional `printserver/` (FastAPI); dev scripts in `scripts/dev/`.
- **Major surfaces:** REST API under `/api/{auth,accounts,core,hr,inventory,pos,consignment,ai,buying}/`; SPA routes via `frontend/src/App.tsx` + production `TemplateView` fallback in `ecothrift/urls.py`.
- **Highest-risk drift:** Inventory inbound (orders, preprocessing, receiving) is mid-evolution per git status; steering docs have initiative path debt for archived buying initiative.
- **Confidence:** **High** for tree shape; **Medium** for exhaustive management-command and migration enumeration.

## Repo Map

| Path | Purpose | Current notes | Risk |
|---|---|---|---|
| `ecothrift/` | Settings, root URLs, WSGI | `/db-admin/` for Django admin; SPA fallback non-API routes | low |
| `apps/accounts/` | Users, JWT auth | `api/auth/`, `api/accounts/` | low |
| `apps/ai/` | Claude proxy | `api/ai/` | low |
| `apps/core/` | Locations, settings, S3 | `api/core/` | low |
| `apps/hr/` | Time clock, sick leave | `api/hr/` | low |
| `apps/inventory/` | Vendors, POs, items, preprocessing, receiving | Heavy WIP in views/serializers/tests + new migration `0028_*` (git); `api/inventory/` | medium |
| `apps/pos/` | Registers, carts, receipts | `api/pos/`; has `apps/pos/tests/` | low |
| `apps/consignment/` | Agreements, payouts, portal | `api/consignment/` | low |
| `apps/buying/` | B-Stock auctions, manifests, valuation | `api/buying/`; many management commands | medium |
| `frontend/src/` | SPA | ~52 `pages/**/*.tsx`; domain hooks in `hooks/`, `api/` | medium |
| `printserver/` | Local printing | Windows-oriented; separate `CHANGELOG` | low |
| `scripts/` | Dev/deploy automation | `dev/*.bat` Heroku-parity jobs | low |
| `.ai/` | Steering, initiatives, protocols | Duplicate `_protocols` trees under initiatives | medium |

## Backend Inventory

| App | Models | API surfaces | Management commands | Migrations | Tests | Notes |
|---|---|---|---|---|---|---|
| accounts | User, profiles | `auth_urls`, `urls` | (minimal) | present | limited | JWT + roles |
| ai | (proxy) | `urls` | — | present | — | Lazy `anthropic` |
| core | Location, AppSetting, S3 | `urls` | `reset_business_data`, etc. | present | — | |
| hr | Time entries, departments | `urls` | backfill/helpers | present | — | |
| inventory | Vendor, PO, Item, Product, staging | `urls` → large `views.py` | Many `backfill_*`, pipeline, preprocessing | 0001–0028+ | `tests/test_*` receiving, preprocessing, PO | Active development |
| pos | Registers, carts, transactions | `urls`, `views` | — | present | `tests/test_cart_*` | |
| consignment | Agreements, items | `urls` | — | present | — | |
| buying | Auction, ManifestRow, CategoryStats, … | `urls`, `api_views` | `sweep_auctions`, `scheduled_sweep`, `compute_daily_category_stats`, manifest/AI commands | present | `tests/test_*` | B-Stock guardrails in `.cursor/rules` |

## Frontend Inventory

| Domain | Routes / pages | API hooks | Components | Types | Tests | Notes |
|---|---|---|---|---|---|---|
| Auth | `/login`, `/forgot-password` | AuthContext | forms | — | none in repo (`*.test.tsx`) | |
| HR | `/hr/*` | `useHr*` patterns | pages under `pages/hr/` | types | none | |
| Inventory | `/inventory/*` (orders, preprocessing, receiving, processing, items, products, vendors, legacy) | `useInventory`, `useStandardManifest`, etc. | Large tree under `components/inventory/` including `preprocessing/` | `inventory.types.ts` | none | 52 page TSX files under `pages/` |
| POS | `/pos/*`, admin setup | hooks | terminal, drawers | — | none | |
| Consignment | `/consignment/*`, consignee | hooks | — | — | none | |
| Admin | `/admin/*` | — | users, settings | — | none | `ManagerRoute` / `AdminRoute` |
| Buying | `/buying/auctions`, detail, watchlist | buying hooks | list/desktop/mobile split | buying types | none | |

## Scripts / Ops Inventory

| Path | Purpose | Safe to run? | External effects | Notes |
|---|---|---|---|---|
| `scripts/dev/start_servers.bat` | Local dev | yes | local ports | |
| `scripts/dev/daily_scheduled_tasks.bat` | Buying jobs parity | conditional | **DB + optional B-Stock** | Do not run sweep/pull without call-count discipline |
| `manage.py *` | Django | per command | DB / API | See workspace rules for B-Stock |

## Shipped Behavior Snapshot

| Capability | Evidence | AI docs that should mention it | Drift? |
|---|---|---|---|
| Inventory v2.20 inbound | `CHANGELOG [2.20.0]`, `App.tsx` receiving routes | `context.md`, `order_processing_pipeline_rebuild.md`, `inventory-pipeline.md`, `frontend.md` | **Low** — indexed to v2.20 |
| Buying CSV-only manifests | `CHANGELOG [2.18.0]` | `bstock.md`, `consultant_context.md` | **Low** |
| Preprocessing 3-step flow | `CHANGELOG [2.20.0]` Added | initiative + extended docs | **Medium** — WIP code may run ahead of last doc timestamp |
| Phase 6 buying outcomes | Not shipped | `context.md` Not Yet Implemented | **Aligned** |

## Test Coverage Gaps

| Area | Existing coverage | Missing coverage | Risk |
|---|---|---|---|
| POS cart / manual line | `apps/pos/tests/` | broader POS flows | medium |
| Buying | normalize, taxonomy SQL, etc. | full API matrix | medium |
| Inventory | receiving API, preprocessing redesign tests | E2E SPA | medium |
| Frontend | none (no Vitest/Jest files found) | component and route tests | high |

## Open Questions

- **Preprocessing WIP** — Do pending commits require `[Unreleased]` before next release? Evidence: user git diff vs `CHANGELOG` top section dated 2.20.0 only.
- **Migration `0028_csvtemplate_vendor_signature_index`** — Verify deployed ordering vs other branches before merge.

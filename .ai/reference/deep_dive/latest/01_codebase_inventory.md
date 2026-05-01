# Codebase Inventory

## Executive Summary

- **Stack:** Django **5.2** + DRF + JWT; React **18.3** + TypeScript + MUI **v7** + Vite **7** + TanStack Query; PostgreSQL (Heroku in prod).
- **Backend apps (8):** `accounts`, `core`, `hr`, `inventory`, `pos`, `consignment`, `ai`, `buying` — all listed in `ecothrift/settings.py` `INSTALLED_APPS`.
- **Domain hotspot:** `apps/inventory/` dominates migrations and API surface for **orders → preprocessing → receiving → processing**.
- **Confidence:** **High** for structure; **Medium** for exact LOC and command counts without a dedicated scan job.

## Repository Topology (High Level)

| Area | Role |
|------|------|
| `ecothrift/` | Django project (`settings`, root `urls`, WSGI/ASGI) |
| `apps/*/` | Domain Django apps (models where applicable; `apps/ai` is API-only in tree — no `models.py`) |
| `frontend/` | Vite SPA (`src/pages`, `src/api`, `src/hooks`, Vitest) |
| `printserver/` | Local FastAPI print stack (see `.ai/extended/print-server.md`) |
| `scripts/` | Dev/deploy helpers (`scripts/dev/*.bat`, scheduled-task parity) |
| `.ai/` | Steering: `context.md`, `consultant_context.md`, `protocols/`, `initiatives/`, `extended/`, `reference/` |
| `workspace/` | Scratch / notebooks / consultant drops (mostly gitignored; whitelisted paths per `.gitignore`) |

## Django Apps

| App | `models.py` | Notes |
|-----|:-------------:|-------|
| `apps.accounts` | yes | Auth-adjacent profiles, permissions |
| `apps.core` | yes | Locations, settings, S3, shared services |
| `apps.hr` | yes | Time clock, departments, sick leave |
| `apps.inventory` | yes | Vendors, POs, manifests, preprocessing, items, receiving |
| `apps.pos` | yes | Registers, carts, receipts, cash movements |
| `apps.consignment` | yes | Agreements, payouts, portal |
| `apps.buying` | yes | B-Stock auctions, manifests (CSV path), valuation |
| `apps.ai` | no | Claude/Grok proxy endpoints (`views.py`, `urls.py`) |

## Migrations (Approximate)

Inventory and buying carry most schema churn.

| App | Migration `.py` files (excl. `__init__`) |
|-----|------------------------------------------|
| `inventory` | ~39 |
| `buying` | ~20 |
| `accounts`, `hr`, `pos`, `consignment`, `core` | Each small (order-of single digits typical) |

Recent inventory themes visible in filenames: preprocessing three-layer (`0036`), AI category flat (`0037`), `ai_status` (`0038`), processor disputes/audits (`0039`).

## Automated Tests (Backend)

Glob snapshot under `apps/*/tests/**/*.py`: **~24** modules (inventory-heavy; buying; POS cart flows). **Gap:** no parallel depth for `accounts`, `core`, `hr`, `consignment`, `ai` in this layout.

Representative inventory tests:

| File | Focus |
|------|--------|
| `test_preprocessing_redesign.py` | Staging rows, cleanup CSV, review PATCH, `ai_status` |
| `test_processing_validation_matrix.py` | Processing workspace validation IDs |
| `test_receiving_api.py` | Receiving / `for-receiving` ordering |
| `test_po_dashboard.py`, `test_po_item_cost.py` | PO list economics / cost allocation |

Frontend: **`frontend/package.json`** script **`test`** → **`vitest run`** (component/unit tests alongside features such as `processingWorkspaceFilters.test.ts`).

## Preprocessing → Final Review → Processing (Representative API Paths)

Authoritative wiring lives on **`PurchaseOrderViewSet`** in **`apps/inventory/views.py`**. Representative `url_path` actions (non-exhaustive):

| Step | Method(s) | `url_path` | Role |
|------|-----------|------------|------|
| Queue / summary | GET | `preprocessing-queue`, `summary` | List work; KPI-style aggregates |
| Manifest ingest | POST | `upload-manifest`, `remove-manifest`, `process-manifest` | Raw CSV + staging seed |
| Standardize | POST | `preview-standardize`, `suggest-formulas` | Step 1 |
| AI cleanup | POST | `ai-cleanup-rows`, `cancel-ai-cleanup` | Step 2 server-side batch |
| Cleanup CSV | GET | `download-cleanup-csv` | Lean pre-AI export |
| Cleanup CSV | POST | `upload-cleanup-csv`, `apply-cleanup-csv` | Merge Grok / offline cleanup |
| Final Review | GET/PATCH | `preprocessing-review` | Step 3 staging edits |
| Reset | POST | `preprocessing-review-reset-final` | Targeted reset |
| Finalize | POST | `finalize-preprocessing` | Coalesce `final_*` → `ManifestRow` / products |
| Processor workspace | GET | `processing-workspace` | Active processor UI payload |
| Processor ops | POST | `processing-*` family | Print, dispute, merge, bulk disposition |

Validation helpers: **`apps/inventory/cleanup_csv_validate.py`** (contract summarized in `.ai/reference/cleanup_csv_contract.md`).

## Frontend Routing Domains (Pointers)

| Concern | Typical location |
|---------|------------------|
| Inventory API wrappers | `frontend/src/api/inventory.api.ts` |
| Preprocessing UI | `frontend/src/pages/inventory/PreprocessingPage.tsx`, `frontend/src/components/inventory/*` |
| Processing workspace | `frontend/src/pages/inventory/processing/*` |
| App router | `frontend/src/App.tsx` |

## Auxiliary Services

- **`printserver/`** — thermal labels / receipts; separate Python env from Django.
- **`workspace/ai-cleanup-grok/`** — optional offline Grok runner (often gitignored); referenced from `CHANGELOG` `[Unreleased]`.

## Notes For `PLAN.md`

- Add **release hygiene** item: slice `[Unreleased]` when user approves bump (`04_version_changelog_audit.md`).
- Add **test gap** item: smoke tests for auth/core paths if those domains gain churn (`Top findings` § tests).

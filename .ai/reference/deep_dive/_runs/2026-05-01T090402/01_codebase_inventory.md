# Codebase Inventory

## Executive Summary

- **Shipped product shape:** Django 5.2 + DRF backend; React 18 + TS + MUI v7 frontend; PostgreSQL. Inventory preprocessing is a **three-tier staging model** (`standard_*`, `ai_*`, `final_*`) on `PreprocessingRow`, promoted to `ManifestRow` on finalize.
- **Major code surfaces:** `apps/inventory/` (models, views, serializers, cleanup validation, layer helpers); `frontend/src/pages/inventory/PreprocessingPage.tsx` + preprocessing components; optional offline `workspace/ai-cleanup-grok/` adjunct.
- **Highest-risk drift areas:** Cleanup CSV schemas (wide vs narrow), finalize coalesce rules, duplicate “review” APIs (`preprocessing-review` vs `manual-review`).
- **Confidence:** **High** for traced paths; **Medium** for full command/job inventory.

## Repo Map

| Path | Purpose | Current notes | Risk |
|---|---|---|---|
| `apps/inventory/` | POs, manifests, preprocessing, processing | Three-layer preprocessing; `cleanup_*` modules; `finalize_preprocessing` rebuilds manifest | medium |
| `apps/buying/` | Auction intelligence | Separate from inbound preprocessing; CSV-only manifests per CHANGELOG | low |
| `frontend/src/pages/inventory/` | Order, preprocessing, receiving, processing | Stepper: Standardize → AI Cleanup → **Final Review** | low |
| `frontend/src/api/inventory.api.ts` | REST client | Extended payloads for review rows, cleanup apply | low |
| `.ai/` | Steering, protocols, deep dives | This run fills `reference/deep_dive/latest/` | low |

## Backend Inventory

| App | Models | API surfaces | Management commands | Migrations state | Tests | Notes |
|---|---|---|---|---|---|---|
| `inventory` | `PreprocessingRow` (three layers), `PurchaseOrder`, `ManifestRow`, `Item`, … | Order viewset: `download-cleanup-csv`, `apply-cleanup-csv` / `upload-cleanup-csv`, `preprocessing-review`, `finalize-preprocessing`, `manual-review`, … | Many (see `apps/inventory/management/commands/`) | Multiple recent migrations (`0036` three-layer, seeds, tracking) — branch has added/untracked migrations in git status | `test_preprocessing_redesign.py` and others | **`update_preprocessing_review_rows`** writes **`ai_*`** from PATCH |

## Frontend Inventory

| Domain | Routes / pages | API hooks | Components | Types | Tests | Notes |
|---|---|---|---|---|---|---|
| Preprocessing | `/inventory/preprocessing/:id` | `useInventory` / `useStandardManifest` / inventory API | `PreprocessingPage`, `CleanupStep`, `PreprocessingReviewTable`, `PreprocessingStepper`, `RowProcessingPanel` | `inventory.types.ts` | Some vitest (e.g. `BucketFieldEditor.test.tsx`, formula snapshot tests) | **Final Review** is step index 2 |
| Orders | `/inventory/orders`, detail | — | `OrderDetailPage`, manifest upload | — | — | Raw manifest unlocks preprocessing |

## Scripts / Ops Inventory

| Path | Purpose | Safe to run? | External effects | Notes |
|---|---|---|---|---|
| `workspace/ai-cleanup-grok/helpers/clean-grok.mjs` | Offline Grok cleanup | Conditional (uses API keys) | xAI API calls | Gitignore story per initiative |
| `scripts/dev/*.bat` | Local dev parity | Yes locally | Local processes | See `extended/development.md` |

## Shipped Behavior Snapshot

| Capability | Evidence | AI docs that should mention it | Drift? |
|---|---|---|---|
| Cleanup apply → **`ai_*`**, **`ai_title`** | `_upload_cleanup_csv_impl` payloads | `inventory-pipeline.md`, initiative | **yes** (naming / step labels) |
| Review PATCH → **`ai_*`** fields | `update_preprocessing_review_rows` | Same | partial |
| Finalize → **`snapshot_finalize_from_ai_and_standard`** then bulk `ManifestRow` create | `finalize_preprocessing` | Same | partial |
| Condition normalization | `normalize_cleanup_condition` in review + cleanup | Extended + CHANGELOG | check |
| Wide **`block_on_quality=False`** + `rejected_rows` / `soft_warnings` (quality folded) | `validate_cleanup_row_values`; optional CSV **`ai_status`** → `PreprocessingRow` | **`cleanup_csv_contract.md`**, pipeline | check |

## Test Coverage Gaps

| Area | Existing coverage | Missing coverage | Risk |
|---|---|---|---|
| Grok wide CSV gates | `test_preprocessing_redesign` | Full round-trip with every `HARD_*` rule id | medium |
| Finalize with partial `final_*` before snapshot | Likely unit/integration | Explicit test that coalesce matches UI preview (`preprocessingCoalesce.ts`) | low–medium |
| `manual-review` after finalize | Unknown | Regression that staging endpoints 409 after finalize | low |

## Open Questions

- Should **`manual-review`** remain staff-primary post-finalize, or is **`preprocessing-review`** only ever pre-finalize? — evidence: `preprocessing_review` returns **409** when `prep.finalized_at` set ([`views.py`](../../../../apps/inventory/views.py) ~3971–3975).

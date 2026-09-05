# Codebase Inventory — 2026-05-18

## Executive Summary

- **Tagged product shape (`HEAD`):** Django 5.2 + DRF **`/api/`** domains; SPA inventory inbound (**Orders**, **Preprocessing**, **Receiving**, **Item Processor**) + Buying + POS — **semver `v2.23.0`** (**Item Processor search blob**) per **`CHANGELOG`**.
- **Working tree adds:** inbound **intake** schema wave **`0045–0051`**, **`Dispute`** model/API surface hints, **`intake_*`** + **`manifest_*`** services + repair command targeting rollout PO ids **316–319**, **`OrderIntakeTimelineDrawer`**, order list vendor filter widening, **`0_pull_prod_to_local.bat`** ergonomics — **none committed**.
- **Major surfaces touched:** **`apps/inventory/`** (`models`, `views`, `serializers`, **`services/`**), **`frontend/src/pages/inventory/*`**, **`frontend/src/api/inventory.api.ts`**, **`.ai/reference/order_processing_pipeline_rebuild/`** operational SQL/recon.
- **Highest-risk drift:** documentation still describing **`PreprocessingOrder`** where Django removed it (**migration `0047`**); merge conflict risk in giant **`views.py`** if parallel edits.
- **Confidence:** **High** for file-level inventory; **Medium** on full runtime matrix until full test pass on migrated DB.

## Repo Map

| Path | Purpose | Current notes | Risk |
|---|---|---|---|
| `ecothrift/` | Settings, URLs, WSGI/ASGI | Standard multi-app split | none |
| `apps/inventory/` | Inbound fulfillment core | Largest delta in working tree; new migrations **`0045–0051`** | **high** |
| `apps/{accounts,buying,consignment,core,hr,pos}/` | Other domains | `HEAD`-stable this audit | none |
| `frontend/src/` | Staff SPA (*MUI*, *React Query*) | Order detail, preprocessing, receiving, processing workspace churn | medium |
| `scripts/deploy/` | Heroku/Git automation | **`0_pull_prod_to_local.bat`** restores **`ecothrift`** schema slice only | low |
| `.ai/` | Steering + audits | Initiative Session 15 steps; deep dives under **`reference/deep_dive`** | none |

## Backend Inventory

| App | Models | API surfaces | Management commands | Migrations (`inventory`) | Tests (high signal) | Notes |
|---|---|---|---|---|---|---|
| **inventory** | **`PurchaseOrder`**, **`Receiving`**, **`PreprocessingRow`**, **`ManifestRow`**, **`ProcessingRow`**, **`Dispute`** (WT), **`Item`**, **`Product`**, **`Vendor`** | **`PurchaseOrderViewSet`** dominates: orders CRUD, manifest upload/remove, preprocessing & cleanup CSV, finalize, **`for-receiving`**, processing workspace/detail, disputes hooks (WT), etc. | **`repair_intake_pipeline_pos`** (WT — apply/verify), **`build_legacy_checkin_queue`** (WT), **`backfill_*`** tweaks | **`0045`** manifest_meta; **`0046`** intake wave rename + PO columns; **`0047`** drop **`PreprocessingOrder`**; **`0048`** receiving timestamps; **`0049`** disputes; **`0050`** processing track / legacy flag; **`0051`** index renames | `test_preprocessing_redesign`, `test_processing_validation_matrix`, `test_receiving_api`, `test_intake_po_repair`, `test_disputes_api`, list dashboard filter (WT), manifest meta surface (WT) | Working tree aligns with **Inbound intake rebuild** narrative |
| *(others unchanged at HEAD)* | — | — | — | — | — | — |

**WT** = exists in working tree, not necessarily at `HEAD`.

### Preprocessing through Final Review (code trace snapshot)

| Step | Django entrypoints | Rows | WT notes |
|---|---|---|---|
| Clean export | **`download_cleanup_csv`** — `PurchaseOrderViewSet` in `apps/inventory/views.py` | **`PreprocessingRow.standard_*`** | Still core |
| Cleanup apply | **`apply_cleanup_csv`**, **`upload_cleanup_csv`**, validation **`cleanup_csv_validate.py`** | **`ai_*`, `ai_title`, `ai_status`** | Contract: **`.ai/reference/cleanup_csv_contract.md`** |
| Final Review | **`preprocessing_review` GET/PATCH** | staging layers | **`ManifestRow`** post-**`finalize-preprocessing`** |
| Standardize/commit | **`process_manifest`** (and related) | **`PreprocessingRow`** linked **`Purchase_order`** (**`0047`** drops intermediate **`PreprocessingOrder`**) — update mental model |

## Frontend Inventory

| Domain | Routes / pages | API hooks | Components | Types | Tests | Notes |
|---|---|---|---|---|---|---|
| Inbound Orders | **`OrderDetailPage.tsx`**, **`OrderListPage.tsx`** | **`useInventory`** / **`inventory.api.ts`** | **`OrderIntakeTimelineDrawer.tsx`** (WT), create PO dialog | **`inventory.types.ts`** | Dashboard filter tests live backend-heavy | Vendor filter widen backend-driven |
| Preprocessing | **`PreprocessingPage.tsx`** | Same | Row panels / cleanup parsers | Extended `PurchaseOrder*` shapes | **`test_preprocessing_redesign`** (server) | Stepper flows |
| Receiving | **`ReceivingOrderPage.tsx`**, redirects | Hooks | **`ReceivingDesktopWorkspace.tsx`** | Types | **`test_receiving_api`** | Pallet/track fields WT |
| Item Processor | **`ProcessingWorkspacePage.tsx`** + modular files | **`useProcessingWorkspace`** etc. | Modals queue | **`inventory.types`** | **`test_processing_validation_matrix`** | Stable at **`HEAD`** |

## Scripts / Ops Inventory

| Path | Purpose | Safe to run? | External effects | Notes |
|---|---|---|---|---|
| `scripts/deploy/0_pull_prod_to_local.bat` | Dump prod **`ecothrift`** schema → local restore | Conditional | **Destructive** local **`ecothrift`** schema; needs Heroku auth + **`pg_dump`/`pg_restore`** | Leaves other schemas untouched |
| `manage.py migrate` | Apply Django migrations | yes | Local/test DB DDL | Requires DB reachability |
| `manage.py repair_intake_pipeline_pos` | Deterministic fixes PO **316–319** | Conditional | Writes PO + items | **`--verify`** gate |

## Shipped Behavior Snapshot

| Capability | Evidence | AI docs that should mention it | Drift? |
|---|---|---|---|
| **`v2.23.0` search blob | `CHANGELOG [2.23.0]`, mig **`0043`** | **`context.md`** | synced |
| **Intake migrations `0045+` | WT files under `apps/inventory/migrations/` | **`CHANGELOG [Unreleased]`**, **`order_processing_pipeline_rebuild`**, **`inventory-pipeline.md`** | was **yes** → **being fixed** |

## Test Coverage Gaps

| Area | Existing coverage | Missing coverage | Risk |
|---|---|---|---|
| Intake disputes rollups end-to-end | **`test_disputes_api`** (WT) | UI E2E / cross-PO matrices | medium |
| Repair targeting only 316–319 | **`repair_intake_pipeline_pos`** + unit test | Expansion if more rollout ids | medium |
| Frontend order timeline drawer | Likely thin | RTL snapshot / integration | medium |

## Open Questions

- **Release versioning:** MINOR vs PATCH envelope for **`0045–0051`** bundle — confirm with stakeholder before **`review.0.Bump` Part 2**.
- **`_backfill_manifest_denorm.py`** at repo root — promote to mgmt cmd or `.gitignore`? — classify before push.

# Deep Dive Run Summary — 2026-05-18

## Executive Summary

| Field | Value |
|---|---|
| Run date | 2026-05-18 |
| Auditor | Cursor agent (composer) |
| Repo version (`HEAD`) | `v2.23.0` (matches `.version` / root `package.json`; **frontend/package.json stays `0.0.0`**) |
| Git state | **Dirty** large working tree vs clean `HEAD` synced to **`origin/main`** / **`heroku/main`** (`959d960`) |
| Overall confidence | **High** for “what exists on disk”; **Medium** for “what will merge cleanly” until tests + commit slicing |

Prior run archived under **`.ai/reference/deep_dive/_runs/20260518T092130/previous_latest/`**.

## Top Findings

| Priority | Finding | Why it matters | Evidence | Recommended action |
|---|---|---|---|---|
| P1 | **Intake rebuild wave is uncommitted** — migrations **`inventory.0045`–`0047`**, receiving timestamps, **`Dispute`** model + rollups, processing track + legacy flag — plus large `views`/serializers/FE deltas | Prod/local DB drift if branch not migrated + coordinated deploy | Untracked `apps/inventory/migrations/004*.py`; modified `apps/inventory/models.py`, `views.py` | Finish **Session 15** execution steps in **`.ai/initiatives/order_processing_pipeline_rebuild.md`**; one coherent release MINOR when ready (**Part 2A** requires explicit release decision) |
| P1 | **Steering doc drift:** `inventory-pipeline.md` still mentions **`PreprocessingOrder`** in Standardize narrative | Readers follow wrong FK model after **`0047`** | `.ai/extended/inventory-pipeline.md` Step 4 | Update Standardize bullet to **`PreprocessingRow` → PO** link only (done this run in extended doc patch) |
| P2 | **Reference hub README removed** replace with `_sql/README.md`, `_recon/README.md`, initiative links | Broken bookmarks in older notes | Deleted `.ai/reference/order_processing_pipeline_rebuild/README.md`; initiative + `_index` updated earlier | Prefer links to **[`_recon/README.md`](../order_processing_pipeline_rebuild/_recon/README.md)** + **[`_sql/README.md`](../order_processing_pipeline_rebuild/_sql/README.md)** |
| P2 | **Repair semantics:** **`repair_intake_pipeline_pos`** preserves **unmanifested intake `Item`** rows (terminal items + overage coexist) | Operational reality on most liquidation POs | `apps/inventory/services/intake_po_repair.py` | Keep verify aligned with ops; regressions guarded by **`test_intake_po_repair`** |
| P3 | **Orders dashboard filter** uses **`Q(vendor_name_cache \| vendor__name)`** | Rows not dropped when **`vendor_name_cache`** stale empty | `apps/inventory/views.py` near **`PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES`** | **`test_purchase_order_list_dashboard_filter`** |

## Report Index

| Report | Status | Notes |
|---|---|---|
| `01_codebase_inventory.md` | complete | Backend/FE map + migrations + intake services |
| `02_context_and_extended_audit.md` | complete | Steering vs tree; preprocessing doc fix |
| `03_initiatives_audit.md` | complete | Session 14/15 framing |
| `04_version_changelog_audit.md` | complete | Bump recommendation = **defer** until release vote |
| `05_cleanup_and_restructure_audit.md` | complete | `__pycache__`, scratch scripts, **`commit_message.txt`** placeholder |
| `PLAN.md` | complete | AI-actionable next sequence |

## Cross-Cutting Risks

- **Schema vs code coupling** — `HEAD` lacks migrations; running app against DB without migrating reproduces **`UndefinedColumn`** class failures (past `pallet_count` symptom). Confidence: **High**.
- **`PreprocessingOrder` removal (`0047`)** breaks any undocumented SQL or forks still joining old table names. Confidence: **Medium**.
- **`B-Stock`** guardrails unaffected by this dive (no API calls performed). Confidence: **High**.

## Recommended Next Step

1. **Run targeted inventory suite** (`test_intake_po_repair`, **`test_disputes_api`**, **`test_receiving_api`**, **`test_purchase_order_list_dashboard_filter`**) on clean DB migrated through **`0051`**.
2. **`review.0.Bump`** when cutting release: MINOR + dated **`CHANGELOG`** section (**user must explicitly request semver bump per protocol**).

## Evidence Gaps

| Gap | Why unresolved | Follow-up needed |
|---|---|---|
| Full cross-app pytest + `vitest build` totals | Scope/time bounded this run | **`session.9.Close.md`** Part 3 matrix before push |
| Heroku **`release`** command ordering vs premigrate SQL | Production-specific policy | Operational runbook `_recon/README.md` rehearsal log |

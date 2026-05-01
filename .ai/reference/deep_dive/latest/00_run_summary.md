# Deep Dive Run Summary

## Executive Summary

| Field | Value |
|---|---|
| Run date | 2026-05-01 |
| Auditor | Agent (Composer), protocol `review.9.Deep.md` |
| Repo version | `v2.20.0` (`.version`) |
| Git state | **Dirty** — ahead of `origin/main` by 8; large set of modified/untracked inventory + preprocessing + deep_dive files; prior `latest/*.md` deleted in index (recreated by this run); untracked `__pycache__`, `frontend/dist`, Vite deps under `node_modules` present in status |
| Overall confidence | **Medium** — code paths for upload → review → finalize were traced in `apps/inventory/views.py` and `layer_helpers.py`; steering doc drift is visible without a full `consultant_context.md` line-by-line diff |

## Preprocessing path (post–AI cleanup upload → final review)

This run stressed the wire drawn in code (not the offline Grok runner):

1. **`POST …/apply-cleanup-csv/`** (alias **`upload-cleanup-csv`**) — [`_upload_cleanup_csv_impl`](../../../../apps/inventory/views.py) builds per-row payloads after **`validate_cleanup_row_values`** ([`cleanup_csv_validate.py`](../../../../apps/inventory/cleanup_csv_validate.py)); rejects the whole batch on hard failures; attaches **`soft_warnings`** when allowed. Wide vs narrow rows gate which keys are required; staging writes target **`ai_*`** / **`ai_title`** (and related) on **`PreprocessingRow`**.
2. **`GET/PATCH …/preprocessing-review/`** — Review listing and paged search; PATCH goes through **`update_preprocessing_review_rows`** ([`views.py`](../../../../apps/inventory/views.py) ~475–560), mapping staff fields (e.g. **`description`**) onto **`ai_description`**, **`title` → `ai_title`**, condition via **`normalize_cleanup_condition`**, plus **`proposed_price`** / **`final_price`** on the staging row.
3. **`POST …/finalize-preprocessing/`** — Optional last PATCH from **`rows`**; then for each staging row, **`effective_preprocessing_row_price`** and title/description checks; **`snapshot_finalize_from_ai_and_standard`** ([`layer_helpers.py`](../../../../apps/inventory/layer_helpers.py) ~133–153) fills **`final_*`**; bulk update; **`ManifestRow.objects.filter(purchase_order=order).delete()`** and **`bulk_create`** new rows from **`final_*`**; product/item/batch follow-up in the same transaction tail.

UI step 3 label (**Final Review**) lives in [`PREPROCESSING_STEP_LABELS`](../../../../frontend/src/components/inventory/preprocessing/PreprocessingStepper.tsx).

## Top Findings

| Priority | Finding | Why it matters | Evidence | Recommended action |
|---|---|---|---|---|
| P1 | **Finalize is the single promotion gate** for staging → canonical manifest | Staff errors in AI layer are coalesced into `final_*` only here; validation blocks finalize without price and without title/description | `finalize_preprocessing` + `snapshot_finalize_from_ai_and_standard` ([`views.py`](../../../../apps/inventory/views.py) ~4162–4230; [`layer_helpers.py`](../../../../apps/inventory/layer_helpers.py) ~133–153) | Keep E2E tests aligned with `missing_price` / `missing_title_or_description`; document in `inventory-pipeline.md` |
| P1 | **Apply-cleanup-csv** distinguishes **wide** (JSON cells + optional title aliases) vs **narrow** rows and validates before any DB write | Wrong shape yields `validation_failed` with `rejected_rows`; soft warnings (e.g. row_number) do not block | `_upload_cleanup_csv_impl` ([`views.py`](../../../../apps/inventory/views.py) ~3442–3634) + `validate_cleanup_row_values` ([`cleanup_csv_validate.py`](../../../../apps/inventory/cleanup_csv_validate.py)) | Ensure `inventory-pipeline.md` / initiative call out 12-col Grok vs legacy narrow explicitly |
| P2 | **`order_processing_pipeline_rebuild` rollup still says Preprocessing is “Next” with placeholder Step 3** | Misroutes planning and contractor context; shipped UI uses **Final Review** | Initiative [`order_processing_pipeline_rebuild.md`](../../../initiatives/order_processing_pipeline_rebuild.md) Progress table vs [`PreprocessingStepper.tsx`](../../../../frontend/src/components/inventory/preprocessing/PreprocessingStepper.tsx) |
| P2 | **`CHANGELOG` [Unreleased] documents `workspace/notebooks/ai-cleanup/…`** | Working tree shows those paths **deleted** (`D` in git status) — changelog may describe files that no longer ship | [`CHANGELOG.md`](../../../../CHANGELOG.md) [Unreleased] Documentation vs `git status` |
| P3 | **Dual review surfaces**: `preprocessing-review` (staging) vs `manual-review` (canonical `ManifestRow`) | After finalize, staff must use canonical APIs/UIs; pre-finalize editing is `ai_*`/`standard_*` / snapshots | [`views.py`](../../../../apps/inventory/views.py) `preprocessing_review` ~3959; `manual_review` ~4030 |

## Report Index

| Report | Status | Notes |
|---|---|---|
| `01_codebase_inventory.md` | complete | Backend + FE inventory; preprocessing modules called out |
| `02_context_and_extended_audit.md` | complete | TOC parity 15↔15; pipeline wording drift |
| `03_initiatives_audit.md` | complete | Active initiative vs shipped stepper |
| `04_version_changelog_audit.md` | complete | `.version` / root `package.json` aligned; rich `[Unreleased]` |
| `05_cleanup_and_restructure_audit.md` | complete | Build artifacts + notebook path churn |
| `PLAN.md` | complete | Action rows with approval flags |

## Cross-Cutting Risks

- **Steering vs product drift** — initiative and extended pipeline prose lag the three-layer model and “Final Review” label; confidence: **Medium**
- **Changelog vs tree** — documented notebook paths may not exist after local deletes; confidence: **Medium**
- **Finalize validation** — strict price + title/description rules can block go-live until review patches land; confidence: **Low** (by design)

## Recommended Next Step

1. Edit **`.ai/initiatives/order_processing_pipeline_rebuild.md`** Progress / Preprocessing section to match shipped Step 3 (**Final Review**) and three-layer staging/Cleanup apply behavior.
2. Reconcile **`CHANGELOG` [Unreleased]** notebook bullets with whether `workspace/notebooks/ai-cleanup/` is removed, moved, or gitignored-only.
3. Patch **`.ai/extended/inventory-pipeline.md`** Step 6 naming (“Manual Review” → **Final Review** where it refers to preprocessing Step 3) and add a short **apply → `ai_*` → finalize coalesce** subsection if missing.

## Evidence Gaps

| Gap | Why unresolved | Follow-up needed |
|---|---|---|
| Full **`consultant_context.md`** diff vs `context.md` TOC | Time-bounded run | Line-by-line TOC parity check per maintenance rule |
| Runtime verification (upload CSV against staging PO) | No local DB fixture in this run | Manual QA or integration test with real Grok export |
| **`ARCHIVE.md` exact row count** vs disk | Spot-checked 16↔16 only | Re-run if files added under `_archived/_completed` |

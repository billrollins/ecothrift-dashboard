---
name: Intake rebuild Wave 1
overview: Schema + write-side cutover — PO owns manifest snippet JSON, template fields, preprocess rollup datetimes/status, pallet rename, receiving.pallet_count rename; strip template-at-upload; dual-write PO in services where transactional; refactor preprocessing-status payload (minimal manifest_sample + top-level matching_templates/standard_columns) and PreprocessingPage; drop PreprocessingOrder.last_ai_import_at after backfill. Shipped in four PRs with human checkpoint between each.
todos:
  - id: pr1-migration-model-serializers
    content: "PR1: migration 0046 (PO fields, PO pallet rename, receiving received_pallet_count rename, backfill, drop prep.last_ai_import_at) + PurchaseOrder/Receiving/PreprocessingOrder models + serializer PATCH guards + detail-surface/list field renames"
    status: pending
  - id: pr2-upload-remove-manifest
    content: "PR2: upload_manifest (slim manifest_preview, PO manifest_signature/headers, no template lookup) + remove_manifest (full PO null/reset per field map + existing S3/prep delete)"
    status: pending
  - id: pr3-process-ensure-prep
    content: "PR3: process_manifest (PO canonical template + timestamps + status; strip manifest_preview template patch) + ensure_preprocessing_raw_rows (no auto template match)"
    status: pending
  - id: pr4-cleanup-review-finalize-status-fe
    content: "PR4: service-layer dual-write for cleanup CSV + review + finalize PO fields; preprocessing_status response refactor; PreprocessingPage consume new shape; frontend types (PO + receiving received_pallet_count)"
    status: pending
  - id: wave-1-5-data-flow-doc
    content: "Wave 1.5 (post-deploy): update data_flow_plan.md §9 Reality check to landed state before Wave 2"
    status: pending
isProject: false
---

# Intake pipeline rebuild — Wave 1 (plan only; do not execute without go-ahead)

## Field map (authoritative)

All field names, NULL semantics, response shapes, and migration rules are defined in:

[`.ai/reference/order_processing_pipeline_rebuild/intake_field_map.md`](../reference/order_processing_pipeline_rebuild/intake_field_map.md)

(A `.txt` alias was requested for external tooling; if needed, keep `intake_field_map.md` canonical in git and duplicate locally to `intake_field_map.txt`.)

[`.ai/reference/order_processing_pipeline_rebuild/recon.md`](../reference/order_processing_pipeline_rebuild/recon.md) — stub in place so [`data_flow_plan.md`](../reference/order_processing_pipeline_rebuild/data_flow_plan.md) §9 links resolve; replace with full recon body when available.

If this plan conflicts with `intake_field_map.md`, **the field map wins**.

---

## Execution sequence (mandatory)

| PR | Scope | Stop condition |
|----|--------|----------------|
| **PR1** | Migration `0046` + models + serializer / read-only / PATCH guards + `PurchaseOrderDetailSurfaceSerializer` / list serializer + `ReceivingDetailSerializer` field rename | Maintainer confirms tests green; **pause for go-ahead** before PR2 |
| **PR2** | `upload_manifest` + `remove_manifest` | Same |
| **PR3** | `process_manifest` + `ensure_preprocessing_raw_rows` | Same |
| **PR4** | Cleanup apply + review + finalize **service** dual-writes; `preprocessing_status` payload refactor; `PreprocessingPage.tsx`; remaining `inventory.types` / receiving types | Same |

Tests ride with whichever PR introduces the behavior (no tests-only PR at end).

---

## A. Migration `0046` (PR1)

Single dependency: [`apps/inventory/migrations/0045_purchase_order_manifest_meta.py`](../apps/inventory/migrations/0045_purchase_order_manifest_meta.py) (or current head).

**PurchaseOrder**

- Add all Wave 1 columns per [intake_field_map.md](../reference/order_processing_pipeline_rebuild/intake_field_map.md): manifest template caches, `standardization_formulas`, status enums + dispute fields, rollup datetimes, `manifest_signature`, `manifest_headers`, FK `template_id`, etc.
- `RenameField` `order_pallet_count` → `pallet_count`.

**`inventory_receiving`**

- `RenameField` `pallet_count` → `received_pallet_count` (migration comment: PO ordered expectation vs receiving operational counts — per field map).

**`inventory_preprocessingorder`**

- **`RunPython` (idempotent):** for each row, copy `last_ai_import_at` → parent `PurchaseOrder.ai_cleaned_at` when PO field empty and source non-null.
- **`RemoveField` `last_ai_import_at`** on `PreprocessingOrder` in the **same** migration after backfill.

**RunPython backfill (PO, idempotent):** mirror prior plan — `manifest_signature` / `manifest_headers` from `manifest_preview` when present; template + caches + `standardization_formulas` from `PreprocessingOrder`; `preprocess_status` from `workflow_status` mapping (`draft`→`not_started`, `standardized`→`standardized`, `ai_imported`→`cleaned`, `review`→`reviewing`, `finalized`→`finalized`); copy `standardized_at`, `review_saved_at`, `finalized_at` from prep; do not overwrite already-set PO fields on re-run.

**Code cleanup same wave:** remove `last_ai_import_at` from [`apps/inventory/models.py`](../apps/inventory/models.py), [`apps/inventory/serializers.py`](../apps/inventory/serializers.py), [`apps/inventory/views.py`](../apps/inventory/views.py) (`_upload_cleanup_csv_impl` must stop reading/writing it; use PO `ai_cleaned_at` only going forward).

---

## B. Model updates (PR1)

[`apps/inventory/models.py`](../apps/inventory/models.py) — `PurchaseOrder` / `Receiving` / `PreprocessingOrder` aligned with migration; `TextChoices` for new status fields per field map.

---

## C. Serializer PATCH guards (PR1)

[`apps/inventory/serializers.py`](../apps/inventory/serializers.py)

- **`PurchaseOrderSerializer`:** add new fields; **`read_only`** on all new/changed manifest + template + rollup + status fields **except** `pallet_count`, `intake_dispute_status`, `processing_dispute_status` (staff actions / code paths write the rest).
- Extend **`_READONLY_MANIFEST_PATCH_FIELDS`** (and `validate`) for `manifest_signature`, `manifest_headers`, and any other forbidden PATCH keys.
- **`PurchaseOrderListSerializer`:** `pallet_count`.
- **`PurchaseOrderDetailSurfaceSerializer`:** expose new scalars the Order Detail / future preprocessing summary need (align with field map + [`order_dashboard_surfaces.md`](../reference/order_processing_pipeline_rebuild/order_dashboard_surfaces.md)).
- **`PreprocessingOrderSerializer`:** drop `last_ai_import_at`.
- **`ReceivingDetailSerializer`:** `received_pallet_count` (rename from `pallet_count`).

---

## D. `upload_manifest` (PR2)

[`apps/inventory/views.py`](../apps/inventory/views.py)

- Keep: `manifest_id`, denormalized file fields, **`manifest_preview` shaped per field map** (headers + delimiter + rows sample only — no `signature`, `row_count`, `template_*`, `vendor_name` inside JSON).
- Add: `manifest_signature` = `header_signature(headers)`; `manifest_headers` = raw header list.
- **Remove:** `CSVTemplate.objects.filter(...)` (~2155–2157) and **`template_*` inside preview dict**.
- Single atomic `save(update_fields=[...])` listing all touched PO fields.

---

## E. `remove_manifest` (PR2)

Per [intake_field_map.md](../reference/order_processing_pipeline_rebuild/intake_field_map.md) **remove_manifest** section — one atomic PO update nulling/resetting **all** listed manifest, template, formula, rollup timestamp fields and **`preprocess_status` → `not_started`**, plus existing **`core_s3file` + prep cascade delete**.

---

## F. `process_manifest` + `ensure_preprocessing_raw_rows` (PR3)

**`process_manifest`**

- When user applies standardization: set on PO `template_id`, `template_*_cache` from chosen [`CSVTemplate`](../apps/inventory/models.py), `standardization_formulas`, `standardized_at=now`, `preprocess_status='standardized'`.
- **Delete** block that mutates `manifest_preview` with `template_id` / `template_name` / `template_mappings` (~2774–2780).
- Continue dual-writing `PreprocessingOrder.template` / `template_name` / `workflow_status` / `standardized_at` / `standardization_formulas` for Wave 2 compatibility.

**`ensure_preprocessing_raw_rows`**

- Remove auto template match (~189–198, 207–215); new `PreprocessingOrder` rows: `template=None`, `template_name=''`.

---

## G. AI cleanup + review + finalize — PO dual-write in **services** (PR4)

**Requirement:** PO updates that must share **`PreprocessingOrder`’s transaction** are implemented in **service functions**, not ad hoc in views after the fact.

- **Finalize:** extend [`finalize_preprocessing_to_bookmarks`](../apps/inventory/services/processing_finalize.py) inside existing `transaction.atomic()` to `order.save(update_fields=[...])` with `finalized_at` + `preprocess_status='finalized'` (same block as `prep.save`).
- **Cleanup CSV staging success:** extract or add a small service helper (e.g. under `apps/inventory/services/`) called from `_upload_cleanup_csv_impl` that, inside the same atomic region as `prep.save`, sets PO `ai_cleaned_at` + `preprocess_status='cleaned'` (and drops `prep.last_ai_import_at` usage — field removed in PR1).
- **Review row saves:** `update_preprocessing_review_rows` should call a service helper or accept `order` and update PO `review_saved_at` (only if null) + `preprocess_status='reviewing'` in one transaction with `prep.save` when rows actually change.

Views remain thin orchestration.

---

## H. `preprocessing_status` + `PreprocessingPage` — **not** a shim (PR4)

**Backend** [`preprocessing_status`](../apps/inventory/views.py)

- **`manifest_sample`:** only `headers`, `delimiter`, `rows` (from `manifest_preview`; ensure upload path stores compatible shape).
- **Move out** of `manifest_sample`: `row_count`, `signature`, `template_id`, `template_name`, `template_mappings`, `vendor_name`, `matching_templates`, `standard_columns`.
- **Top-level** response keys: `matching_templates`, `standard_columns` (same data as today, wrong nesting removed).
- **`order` / PO summary** in payload: include `manifest_row_count`, `manifest_signature`, vendor display, `template_id`, `template_*_cache`, and any other fields the Standardize UI needs that were previously read from the bloated `manifest_sample`.

**Frontend** [`frontend/src/pages/inventory/PreprocessingPage.tsx`](../frontend/src/pages/inventory/PreprocessingPage.tsx)

- Consume **`manifest_sample`** only for file snippet.
- Read counts / signature / template / matching templates / standard columns from **`preprocessing-status`** top-level + **`order`** (or equivalent response fields).
- Update hooks/types under [`frontend/src/hooks`](../frontend/src/hooks) / [`frontend/src/types/inventory.types.ts`](../frontend/src/types/inventory.types.ts) for the new response shape.

---

## I. Frontend types — PO + receiving (PR4)

[`frontend/src/types/inventory.types.ts`](../frontend/src/types/inventory.types.ts)

- `PurchaseOrder` / `PurchaseOrderDetailSurface`: `pallet_count`; new PO fields from field map.
- Receiving types: `received_pallet_count` instead of `pallet_count` on receiving payloads (align with serializer).
- [`OrderDetailPage.tsx`](../frontend/src/pages/inventory/OrderDetailPage.tsx), [`CreatePurchaseOrderDialog.tsx`](../frontend/src/components/inventory/CreatePurchaseOrderDialog.tsx): `pallet_count` field naming.
- Receiving UI components referencing receiving `pallet_count` → `received_pallet_count` (grep [`frontend/src`](../frontend/src)).

---

## J. Tests (distributed across PRs)

- **PR1:** migration backfill idempotency; receiving column rename; `PreprocessingOrder` no `last_ai_import_at`; PATCH rejects new read-only PO keys.
- **PR2:** upload sets `manifest_signature` / headers + slim preview; no template keys in `manifest_preview`; remove clears full PO field map list + resets `preprocess_status`.
- **PR3:** `process-manifest` sets PO template + caches + `standardized_at` + status; no preview template mutation; ensure-prep creates without template.
- **PR4:** cleanup sets PO `ai_cleaned_at` + status; review sets PO `review_saved_at` rule + status; finalize sets PO in service txn; **`preprocessing_status`** JSON shape asserts (`manifest_sample` minimal; `matching_templates` / `standard_columns` top-level); frontend types compile (CI / `npm run build`).

---

## Won’t do in Wave 1

- Wave 2: derive `completedStep` from `preprocess_status` only; drop reliance on `PreprocessingOrder.workflow_status` / `current_step` in API/UI.
- Wave 3: drop `PreprocessingOrder` table.
- Wave 4: `preview_standardize` / `manifest_rows` S3 parse reduction.
- Renaming `standard_*` columns on `PreprocessingRow`.
- Processing / receiving **feature** work beyond schema rename + serializers for `received_pallet_count`.
- Resolving open design Q1–Q3 / Q14–Q15 (manifest row timing, processing row granularity, etc.) — flag if Wave 1 work surfaces blockers.

---

## Verification

**Automated:** pytest for inventory app per PR; `npm run build` after PR4 TS changes.

**Manual smoke** (after PR4): upload → preprocessing Standardize still works with new payload shape; cleanup → review → finalize; Order Detail shows correct manifest meta; receiving edit screen still works with renamed receiving pallet field.

---

## Wave 1.5 follow-up (post-deploy, before Wave 2)

Update [`.ai/reference/order_processing_pipeline_rebuild/data_flow_plan.md`](../reference/order_processing_pipeline_rebuild/data_flow_plan.md) **§9 Reality check vs current code** to reflect landed line-of-sight (template-at-upload removed, `manifest_sample` shape, PO columns, `last_ai_import_at` removed, receiving rename, etc.). No code in this step — documentation sync only.

---

## Notes (vs prior plan revision)

- Removed **“compatibility shim”** language — the `preprocessing_status` / `PreprocessingPage` work is a **correct payload refactor**, not a temporary fallback.
- **`remove_manifest`** scope is now exactly the field-map NULL/reset list (not “decide later”).
- **`last_ai_import_at`:** dropped from model in `0046` after backfill to `PurchaseOrder.ai_cleaned_at`; all consumers removed.
- **Receiving:** `pallet_count` → `received_pallet_count` in `0046` with serializer + FE follow-through.
- **Dual-write:** finalize already in service; cleanup + review explicitly moved to **service-layer** atomic helpers for PR4.
- **PR cadence** + **stop-between-PRs** gate added per your instruction.

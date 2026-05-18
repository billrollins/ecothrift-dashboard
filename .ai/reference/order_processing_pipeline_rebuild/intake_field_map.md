<!--
  Authoritative field-level spec for intake / Wave 1+.
  Plan and code must match this file; it wins over older plan text.
  (Requested filename was intake_field_map.txt; this .md is the in-repo
  canonical copy — duplicate to .txt if a plain-text alias is required.)
-->

---

## manifest_preview (JSON on `inventory_purchaseorder`, set at upload)

After Wave 1 `upload_manifest`, persist **only** file-snippet data needed for UI previews:

- `headers`
- `delimiter`
- `rows` (bounded sample from the file, same semantics as today)

**Do not** store in `manifest_preview`: `signature`, `row_count`, `template_id`, `template_name`, `template_mappings`, `vendor_name`. Those belong on PO columns or elsewhere (see below).

---

## `inventory_purchaseorder` — manifest + template (Wave 1 columns)

**Denormalized / upload-time** (already or newly written in Wave 1):  
`manifest_id`, `manifest_filename`, `manifest_uploaded_at`, `manifest_row_count`, `manifest_category_count`, `manifest_signature`, `manifest_headers`

**Template + standardization** (Step 3 / `process_manifest` + compat dual-write):  
`template_id` (FK `inventory_csvtemplate`, nullable), `template_name_cache`, `template_header_signature_cache`, `template_column_mappings_cache`, `standardization_formulas` (JSONB)

**Preprocess train:**  
`preprocess_status` — `CharField` choices: `not_started` | `standardized` | `cleaned` | `reviewing` | `finalized`  
`standardized_at`, `ai_cleaned_at`, `review_saved_at`, `finalized_at` (DateTime, nullable)

**Other parallel trains** (PO columns):  
- `receiving_status` — `not_started` | `active` | `done`; `receiving_started_at`, `receiving_done_at` (nullable datetimes).  
- `processing_status` — `not_started` | `active` | `done`; `processing_started_at`, `processing_done_at` (nullable).  
- `uses_legacy_processing` — bool; legacy deliver / check-in paths apply only when True (backfilled).  
- `closeout_status` (still minimal: `open` only in this bundle)  
- `intake_dispute_status`, `processing_dispute_status` — `none` | `active` | `resolved` (rollups from `inventory_dispute`)  
- `closed_at` (DateTime, nullable)

**Pallet:**  
`pallet_count` (renamed from `order_pallet_count`)

Vendor display is via `vendor_id` + `vendor_*_cache`; not stored inside `manifest_preview`.

---

## `remove_manifest` — single atomic `PurchaseOrder` update (plus file + staging delete)

NULL or clear on the PO in the same save as today’s manifest clears:

- `manifest_id`, `manifest_filename`, `manifest_uploaded_at`, `manifest_row_count`, `manifest_category_count`, `manifest_preview`, `manifest_headers`, `manifest_signature`
- `template_id`, `template_name_cache`, `template_header_signature_cache`, `template_column_mappings_cache`, `standardization_formulas`
- `standardized_at`, `ai_cleaned_at`, `review_saved_at`, `finalized_at`
- `preprocess_status` **RESET** to `not_started`

Also (existing behavior, keep): delete `core_s3file` row + storage key; delete all `PreprocessingRow` rows for this PO.

---

## `GET …/preprocessing-status/` — response shape (Wave 1)

**`manifest_sample`:** `{ headers, delimiter, rows }` **only** — snippet of the file, nothing else.

**Top-level siblings** on the same JSON response (not inside `manifest_sample`):

- `matching_templates` — result of template lookup / list for picker (same query logic as today; not file content)
- `standard_columns` — equivalent of `manifest_standard_flat_columns()` list; **does not** belong on PO

**`order`** (or embedded PO summary): must expose for frontend anything that left `manifest_sample`, including at minimum: `manifest_row_count`, `manifest_signature`, vendor name (from cache or join), `template_id`, `template_*_cache`, and other PO scalars already returned as needed.

---

## `inventory_preprocessingorder` — migration 0046

- Backfill: copy `last_ai_import_at` → `purchaseorder.ai_cleaned_at` where applicable.
- Then **DROP** column `last_ai_import_at` from `inventory_preprocessingorder` (same migration).
- Remove all reads/writes of `last_ai_import_at` in app code in the same wave.

---

## `inventory_receiving` — migration 0046

**Rename column:** `pallet_count` → `received_pallet_count`

**Migration comment:** PO carries ordered pallet expectation (`pallet_count`). Receiving tracks operational counts (received / damaged / missing, etc.); distinct names avoid confusion across serializers.

Update `ReceivingDetailSerializer` and frontend types using the old name.

---

## Dual-write rule (historical Wave 1)

**Superseded (Wave 3 — May 2026):** `PreprocessingOrder` is removed. Mutations that must be atomic (e.g. `finalize_preprocessing_to_bookmarks`, staging bulk writes) still run inside a single `transaction.atomic()` on the `PurchaseOrder` and related rows—there is no separate prep parent row to dual-write.

---

## `inventory_dispute` (Waves 5–6)

- `purchase_order` (FK, required)  
- `kind` — `intake` | `processing`  
- `status` — `open` | `resolved` | `cancelled`  
- `title`, `description`, `opened_by`, `opened_at`, `resolved_by`, `resolved_at`  
- Optional subjects: `subject_receiving`, `subject_pallet`, `subject_manifest_row`, `subject_processing_row`, `subject_item` (nullable FKs)  
- `payload` JSON for grouped migrations and extra context  

Rollups on `PurchaseOrder` are recalculated after create/resolve/cancel.

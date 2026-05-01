<!-- Last updated: 2026-05-01 -->

# Cleanup CSV apply — contract

Single-page reference for **`POST /api/inventory/orders/{id}/apply-cleanup-csv/`** and **`POST …/upload-cleanup-csv/`** (same backend: **`_upload_cleanup_csv_impl`** in [`apps/inventory/views.py`](../../apps/inventory/views.py)).

## Target rows

- **Staging (usual):** Non-finalized **`PreprocessingOrder`** with staged **`PreprocessingRow`** records — apply updates **`ai_*`**, **`ai_title`**, **`proposed_price`**, etc.
- **Fallback:** If staging is absent, apply targets **`ManifestRow`** (**narrow** schema only; wide Grok-style columns are rejected).

## Wire formats

- **Wide (Grok / Excel round-trip on staging):** Non-empty cells in the staging-wide signal columns (see **`_CLEANUP_STAGING_WIDE_SIGNAL_KEYS`** in **`views.py`**). Typically includes **`title`** / category / condition / price / text / **`specifications_json`** / **`search_tags_json`**; category may be filled from **`taxonomy_json`** when the flat category cell is empty.
- **Narrow (legacy seven columns):** Every row must include keys in **`NARROW_AI_CLEANUP_KEYS`** — **`row_id`**, **`ai_title`**, **`ai_brand`**, **`ai_model`**, **`category`**, **`condition`**, **`proposed_price`**.

Rows must cover **exactly** the set of staging or manifest row ids (one row per id); otherwise **`row_count_mismatch`** or **`missing_row_ids`**.

## Validation and HTTP shape

All validation runs in **`validate_cleanup_row_values`** ([`apps/inventory/cleanup_csv_validate.py`](../../apps/inventory/cleanup_csv_validate.py)).

- **Hard failures —** **`400`** with **`code`: `validation_failed`**, **`rows_updated`: 0**, **`rejected_rows`** entries with **`rule`** and optional **`column`**. Examples: **`HARD_TITLE_PRESENT`**, **`HARD_TITLE_LENGTH`**, **`HARD_CATEGORY_VALID`**, **`HARD_CONDITION_VALID`**, **`HARD_PRICE_PRESENT`**, **`HARD_PRICE_NUMERIC`**, **`HARD_PRICE_MIN`**, **`HARD_PRICE_MAX`**, **`HARD_DESCRIPTION_PRESENT`** (wide), **`HARD_SPECS_*`**, **`HARD_TAGS_*`**. No database updates.
- **Soft warnings —** Success payload may include **`soft_warnings`**: e.g. **`SOFT_PRICE_VS_RETAIL`**, **`SOFT_PRICE_VS_IDEAL`**, **`SOFT_DESC_NO_BRAND`**, **`SOFT_DESC_NO_CATEGORY`**, plus **`SOFT_ROW_NUMBER_MISMATCH`** (from **`views.py`** when CSV **`row_number`** disagrees with staging).

## Related

- **End-to-end PO flow:** [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- **Offline Grok harness (workspace):** `workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md` — gitignored unless whitelisted at repo root **`.gitignore`**

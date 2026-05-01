<!-- Last updated: 2026-05-01 -->

# Cleanup CSV apply — contract

Single-page reference for **`POST /api/inventory/orders/{id}/apply-cleanup-csv/`** and **`POST …/upload-cleanup-csv/`** (same backend: **`_upload_cleanup_csv_impl`** in [`apps/inventory/views.py`](../../apps/inventory/views.py)).

## Target rows

- **Staging (usual):** Non-finalized **`PreprocessingOrder`** with staged **`PreprocessingRow`** records — apply updates **`ai_*`**, **`ai_title`**, **`proposed_price`**, etc.
- **Fallback:** If staging is absent, apply targets **`ManifestRow`** (**narrow** schema only; wide Grok-style columns are rejected).

## Wire formats

- **Wide (Grok / Excel round-trip on staging):** Non-empty cells in the staging-wide signal columns (see **`_CLEANUP_STAGING_WIDE_SIGNAL_KEYS`** in **`views.py`**). Typically includes **`title`** / category / condition / price / text / **`specifications_json`** / **`search_tags_json`**; category may be filled from **`taxonomy_json`** when the flat category cell is empty. Optional column **`ai_status`**: JSON object per row (from offline Grok / recovery tooling); parsed and stored on **`PreprocessingRow.ai_status`**. Invalid JSON in **`ai_status`** rejects that row; an omitted or blank cell leaves **`ai_status`** as **`{}`** on save.
- **Narrow (legacy seven columns):** Every row must include keys in **`NARROW_AI_CLEANUP_KEYS`** — **`row_id`**, **`ai_title`**, **`ai_brand`**, **`ai_model`**, **`category`**, **`condition`**, **`proposed_price`**. Extra columns such as **`ai_status`** are allowed when present (same JSON rules as wide).

Rows must cover **exactly** the set of staging or manifest row ids (one row per id); otherwise **`row_count_mismatch`** or **`missing_row_ids`**.

## Validation and HTTP shape

All validation runs in **`validate_cleanup_row_values`** ([`apps/inventory/cleanup_csv_validate.py`](../../apps/inventory/cleanup_csv_validate.py)). For **staging-wide** rows the caller passes **`block_on_quality=False`**: title length, category/condition/price/description **quality** rules that would normally hard-fail are instead surfaced as extra **`soft_warnings`** entries (same shape as other soft rows), and specs/tags may be defaulted when cells are empty **unless JSON is invalid** (invalid JSON still **`400`**).

- **Hard failures —** **`400`** with **`code`: `validation_failed`**, **`rows_updated`: 0**, **`rejected_rows`**. On **staging-wide** import, **`validate_cleanup_row_values`** is called with **`block_on_quality=False`**: most **`HARD_*`** “quality” rules (title, category, condition, price presence/range, description, empty specs/tags) are **non-blocking** and are reported in **`soft_warnings`** instead. **Still blocking** on wide rows: **`specifications_json`** / **`search_tags_json`** that are **invalid JSON** or **wrong top-level type** (object vs array). **Narrow** apply (**`block_on_quality=True`**) keeps the full hard gate set (e.g. **`HARD_TITLE_PRESENT`**, **`HARD_CATEGORY_VALID`**, **`HARD_PRICE_*`**, **`HARD_DESCRIPTION_PRESENT`**, strict specs/tags). The upload layer may also **`400`** for row-id mismatch, unknown ids, duplicate ids, or bad **`ai_status`** JSON. No database updates on **`400`**.
- **Soft warnings —** Success payload may include **`soft_warnings`**: e.g. **`SOFT_PRICE_VS_RETAIL`**, **`SOFT_PRICE_VS_IDEAL`**, **`SOFT_DESC_NO_BRAND`**, **`SOFT_DESC_NO_CATEGORY`**, plus **`SOFT_ROW_NUMBER_MISMATCH`** (from **`views.py`** when CSV **`row_number`** disagrees with staging). When **`block_on_quality`** is **False**, former quality hard rules (e.g. **`HARD_TITLE_LENGTH`**) appear here so staff still see them after a successful apply.

## Related

- **End-to-end PO flow:** [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- **Offline Grok harness (workspace):** single **`<stem>.cleaned.csv`** output with the same wide columns plus **`ai_status`** (no separate failures/warnings CSV files); see **`workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md`** — gitignored unless whitelisted at repo root **`.gitignore`**

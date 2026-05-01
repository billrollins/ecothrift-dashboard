# Bucket Fields in Formula Mappings + Three Seed Templates

Three coordinated changes. Land them in one PR series.

1. Flip all four buckets to fully open keysets.
2. Wire bucket fields into the Formula Mappings UI as collapsible row entries with a sub-key editor modal.
3. Create three seed `CSVTemplate` rows (Target Basic, Costco Basic, Amazon Basic) using the new bucket-aware formulas.

---

## 1. Open buckets

The current `manifest_standard_fields.py` has `identifiers`, `taxonomy`, and `tracking` as `open: false` with closed `known_keys` lists. This is wrong for this product. The whole point of using jsonb is flexibility per vendor. New vendors bring identifiers and taxonomy keys we can't pre-enumerate.

### Changes

In `apps/inventory/manifest_standard_fields.py`, flip every bucket to `open: true` and rename `known_keys` to `suggested_keys`:

```python
BUCKETS = {
    "identifiers": {
        "label": "Identifiers",
        "suggested_keys": ["upc", "asin", "sku", "mpn", "ean", "item_number", "gtin"],
        "open": True,
    },
    "taxonomy": {
        "label": "Taxonomy",
        "suggested_keys": ["category", "subcategory", "department", "product_class", "seller_category", "division", "gl_description", "category_code"],
        "open": True,
    },
    "specifications": {
        "label": "Specifications",
        "suggested_keys": [],
        "open": True,
    },
    "tracking": {
        "label": "Tracking",
        "suggested_keys": ["lot_id", "pallet_id", "lpn", "location"],
        "open": True,
    },
}
```

The four bucket prefixes themselves stay closed. Adding a fifth bucket requires a migration (new jsonb column, new GIN index), so that's not a runtime decision. `tracking` is the catch-all for any operational metadata that doesn't fit the other three.

### Validation rules

In `normalize_standard_mappings` and `normalize_row`:

- Target regex stays: `^[a-z_]+(\.[a-z][a-z0-9_]*)?$`
- If the target is dotted, the prefix must be one of `{identifiers, taxonomy, specifications, tracking}`. Reject unknown prefixes.
- The sub-key (right of the dot) is **not** validated against `suggested_keys`. Any string matching `^[a-z][a-z0-9_]*$` is accepted.

### API contract update

`GET /api/inventory/manifest-fields/` response: rename `known_keys` to `suggested_keys` in each bucket entry. Otherwise unchanged. Frontend treats `suggested_keys` as autocomplete hints, not a validation list.

### AI prompt update

In `suggest_formulas` system prompt, update the bucket guidance:

> For nested fields, use `bucket.subkey` syntax in the target. Example targets: `identifiers.upc`, `taxonomy.subcategory`, `tracking.lot_id`.
>
> Each bucket has `suggested_keys` representing common sub-keys we've seen across vendors. **Prefer suggested keys when a column clearly matches** (`UPC` column → `identifiers.upc`, not `identifiers.product_upc`). When a column does not match any suggested key, you may emit a custom sub-key as long as it matches `^[a-z][a-z0-9_]*$`.
>
> The four bucket prefixes are fixed: `identifiers`, `taxonomy`, `specifications`, `tracking`. Do not invent new bucket prefixes.

---

## 2. Bucket fields in Formula Mappings UI

Today the Formula Mappings table shows only flat fields. Add four bucket rows so users can edit dot-target sub-keys without dropping into raw JSON.

### Row display

Each bucket gets one row in the main Formula Mappings table. Layout matches existing flat field rows (same columns, same height) so the table doesn't reflow:

| Standard Field | Formula | Sample Result |
|---|---|---|
| `Identifiers` | **3 Fields** _(badge)_ | `{"upc": "053891143677", "sku": "8336...` |
| `Taxonomy` | **5 Fields** _(badge)_ | `{"category": "MIXED_SMALL_APPLI...` |
| `Specifications` | **No Fields** _(muted)_ | `{}` |
| `Tracking` | **3 Fields** _(badge)_ | `{"lot_id": "irc_small_appli...` |

Behavior:

- **Formula column shows a count badge.** "3 Fields" if the bucket has 3 sub-key formulas defined, "No Fields" (muted styling) if empty. No formula text shown here.
- **Sample Result column shows truncated JSON.** Single line, ellipsized at column width. Format the truncation against the evaluated bucket dict for sample row 1, the same way flat fields preview their evaluation.
- **Hover on Sample Result** shows a tooltip with the full formatted JSON (pretty-printed, multiline). Use the same tooltip component the rest of the app uses; if a hover-tooltip-with-formatted-content pattern doesn't exist, MUI `Tooltip` with `PRE` content works.
- **Click anywhere on the row** (or a dedicated "Edit" affordance, your call) opens the bucket editor modal.

### Bucket editor modal

The modal is a focused version of the main Formula Mappings table, scoped to one bucket.

**Header:**
- Title: `Edit Identifiers` (or whichever bucket).
- Subtitle: short description from `BUCKETS[bucket].label` plus a one-line hint like "Product identifiers used for matching." Optional, can be omitted.

**Body:**
- Quick-add chips at the top: render `suggested_keys` from the API as clickable chips. Clicking adds a new row pre-filled with that sub-key name and an empty formula. Already-added suggestions are disabled (grayed) so users can't accidentally add duplicates.
- Editable list of rows below. Each row has:
  - **Field Name** input. Validates against `^[a-z][a-z0-9_]*$`. Show inline error on invalid input. Disable Save while any row is invalid.
  - **Formula** input. Reuses the same formula input component as the main table (column reference autocomplete, function hints, whatever exists today).
  - **Sample Result** cell. Live evaluation against sample row 1, same as the main table.
  - **Remove** button (trash icon).
- "+ Add Field" button below the list. Adds a blank row. Field Name input gets focus.

**Footer:**
- Cancel button. Discards changes and closes.
- Save button. Validates all rows, applies changes to the parent formulas state, closes modal.

**Validation:**
- Field Name regex: `^[a-z][a-z0-9_]*$`
- No duplicate Field Names within the same bucket
- Empty formula is allowed (sub-key just won't be written at row evaluation time)
- Empty Field Name is not allowed

### State management

The parent `useStandardManifest` hook needs to track bucket sub-keys alongside flat formulas. Two approaches:

**Approach A (recommended):** Keep the existing flat formulas keyed by target string. Bucket sub-keys live in the same map under their dot-target key (`identifiers.upc`, `taxonomy.category`, etc). The main table renders rows for flat keys only. Bucket rows are computed: filter formulas by prefix, count, render summary. Modal reads/writes the same flat map, just filtered to one prefix.

This means no new state shape. The hook already stores `{[target]: formula}`. We just add dotted keys to the same dict. `process_manifest` already handles dot-targets in `normalize_row`.

**Approach B:** Nest formulas under buckets in the hook state. More structured but requires reshaping serialization and the existing flat-key contract. Don't.

Use Approach A.

### Frontend wiring

Today the UI uses `manifestPreview?.standard_columns` (flat slice only) and falls back to `FALLBACK_STANDARD_COLUMNS` (legacy hardcoded list). Both need to go.

Changes:

1. Add a `useManifestFields()` hook (or extend an existing API hook) that fetches `GET /api/inventory/manifest-fields/`. React Query, cache aggressively, this is essentially static metadata.
2. Delete `FALLBACK_STANDARD_COLUMNS` and `SOURCE_ALIASES` from `useStandardManifest.ts`. The hook fails loudly if metadata isn't available rather than silently using stale fallbacks.
3. `StandardManifestBuilder` consumes the metadata response: render flat fields as today, render bucket rows below with the count-badge UI described above.
4. The bucket modal is a new component (`BucketFieldEditor` or similar) that takes `bucket: 'identifiers' | 'taxonomy' | 'specifications' | 'tracking'`, the current sub-key formulas for that bucket, and a callback to apply changes.

### Sample evaluation for buckets

The existing sample preview evaluates each formula against row 1's raw cells. For bucket rows in the main table, evaluate every sub-key formula in the bucket and assemble the resulting dict, dropping any sub-key whose formula evaluates to empty string. Then JSON-stringify for the Sample Result cell.

For the modal, each sub-key row gets its own Sample Result cell evaluating just that one formula, identical to flat field rows.

---

## 3. Three seed templates

Create three `CSVTemplate` rows for the manifest shapes we have on hand. Templates serve two purposes: real seed data for live use, and worked examples for the `suggest_formulas` system prompt.

### Naming

| Template Name | Vendor lookup |
|---|---|
| `Target Basic` | vendor with name matching Target seed |
| `Costco Basic` | vendor with name matching Costco seed |
| `Amazon Basic` | vendor with name matching Amazon FBA seed |

Set `is_default = true` for all three so they auto-match by header signature.

### Header signature

Compute `header_signature` for each template using the existing helper that `process_manifest` and template lookup use. Don't hardcode hashes from samples. The sample headers below are inputs to the helper, not the stored values.

### Template 1: Target Basic

**Sample headers:**

```
Item #,Seller Category,Item Description,Qty,Unit Retail,Ext. Retail,Brand,UPC,TCIN,Origin,Category,Condition,Product Class,Category Code,Division,Department,Optoro Condition,Pallet ID,Subcategory,Lot ID
```

**`column_mappings`:**

```json
[
  {"target": "quantity", "formula": "TRIM([Qty])"},
  {"target": "unit_retail", "formula": "TRIM([Unit Retail])"},
  {"target": "description", "formula": "TRIM([Item Description])"},
  {"target": "brand", "formula": "TRIM([Brand])"},
  {"target": "condition", "formula": "TRIM([Condition])"},
  {"target": "identifiers.upc", "formula": "TRIM([UPC])"},
  {"target": "identifiers.sku", "formula": "TRIM([TCIN])"},
  {"target": "taxonomy.category", "formula": "TRIM([Category])"},
  {"target": "taxonomy.subcategory", "formula": "TITLE(TRIM([Subcategory]))"},
  {"target": "taxonomy.department", "formula": "TITLE(TRIM([Department]))"},
  {"target": "taxonomy.product_class", "formula": "TITLE(TRIM([Product Class]))"},
  {"target": "taxonomy.seller_category", "formula": "TITLE(TRIM([Seller Category]))"},
  {"target": "taxonomy.division", "formula": "TITLE(TRIM([Division]))"},
  {"target": "taxonomy.category_code", "formula": "TRIM([Category Code])"},
  {"target": "specifications.origin", "formula": "TRIM([Origin])"},
  {"target": "tracking.lot_id", "formula": "TRIM([Lot ID])"},
  {"target": "tracking.pallet_id", "formula": "TRIM([Pallet ID])"},
  {"target": "tracking.lpn", "formula": "TRIM([Item #])"}
]
```

**Notes:**
- Target's `Item #` (e.g. `LPJY786012`) is Optoro's per-unit license plate, not a product number. Goes in `tracking.lpn`, not `identifiers`.
- `TCIN` is Target's catalog SKU. Goes in `identifiers.sku`.
- `Optoro Condition` (one-letter codes) is operational and redundant with `Condition`. Skipped.
- TITLE applied to display-text taxonomy fields that arrive uniformly UPPERCASE. TRIM-only on `category` and `category_code` because those are controlled vocabulary codes (`MIXED_SMALL_APPLIANCES`).

### Template 2: Costco Basic

**Sample headers:**

```
Lot ID,Location,Item #,Dept. Code,Department,Item Description,Qty,Unit Retail,Ext. Retail,Model,Serial #,Vendor,Category Code,Seller Category,Category,Condition
```

**`column_mappings`:**

```json
[
  {"target": "quantity", "formula": "TRIM([Qty])"},
  {"target": "unit_retail", "formula": "TRIM([Unit Retail])"},
  {"target": "description", "formula": "TITLE(TRIM([Item Description]))"},
  {"target": "brand", "formula": "TITLE(TRIM([Vendor]))"},
  {"target": "model", "formula": "TRIM([Model])"},
  {"target": "condition", "formula": "TRIM([Condition])"},
  {"target": "identifiers.item_number", "formula": "TRIM([Item #])"},
  {"target": "taxonomy.category", "formula": "TRIM([Category])"},
  {"target": "taxonomy.department", "formula": "TITLE(TRIM([Department]))"},
  {"target": "taxonomy.seller_category", "formula": "TRIM([Seller Category])"},
  {"target": "taxonomy.category_code", "formula": "TRIM([Category Code])"},
  {"target": "specifications.serial_number", "formula": "TRIM([Serial #])"},
  {"target": "tracking.lot_id", "formula": "TRIM([Lot ID])"},
  {"target": "tracking.location", "formula": "TRIM([Location])"}
]
```

**Notes:**
- Costco's `Item #` is numeric (e.g. `962680`), shared across units of the same product. Goes in `identifiers.item_number`.
- `Vendor` column has distributor names like `AMERICAN TEXTILE CO INC`. Mapped to `brand` with TITLE for readability. AI cleanup will further normalize.
- `description` gets TITLE because Costco descriptions are uniformly UPPERCASE codes (`BRIO 740 BOTTOM LOAD`).
- `seller_category` is TRIM-only because Costco's source values are already mixed-case (`Cookware`, `Bathroom/Kitchen Hardware`).
- No UPC/ASIN/EAN columns. Identifiers bucket is sparse.

### Template 3: Amazon Basic

**Sample headers:**

```
Category,Subcategory,ASIN,Item Description,Qty,Unit Retail,Ext. Retail,Product Class,GL Description,Seller Category,EAN,LPN,UPC,Brand,Condition,Pallet ID,Lot ID
```

**`column_mappings`:**

```json
[
  {"target": "quantity", "formula": "TRIM([Qty])"},
  {"target": "unit_retail", "formula": "TRIM([Unit Retail])"},
  {"target": "description", "formula": "TRIM([Item Description])"},
  {"target": "brand", "formula": "TRIM([Brand])"},
  {"target": "condition", "formula": "TRIM([Condition])"},
  {"target": "identifiers.upc", "formula": "TRIM([UPC])"},
  {"target": "identifiers.ean", "formula": "TRIM([EAN])"},
  {"target": "identifiers.asin", "formula": "TRIM([ASIN])"},
  {"target": "taxonomy.category", "formula": "TRIM([Category])"},
  {"target": "taxonomy.subcategory", "formula": "TRIM([Subcategory])"},
  {"target": "taxonomy.product_class", "formula": "TRIM([Product Class])"},
  {"target": "taxonomy.seller_category", "formula": "TRIM([Seller Category])"},
  {"target": "taxonomy.gl_description", "formula": "TRIM([GL Description])"},
  {"target": "tracking.lot_id", "formula": "TRIM([Lot ID])"},
  {"target": "tracking.pallet_id", "formula": "TRIM([Pallet ID])"},
  {"target": "tracking.lpn", "formula": "TRIM([LPN])"}
]
```

**Notes:**
- Three barcode-style identifiers (UPC, EAN, ASIN) all populated. UPC is sometimes empty when EAN is present (international products).
- All TRIM, no TITLE. Amazon data is already well-cased at the source.

### Casing decision rules (verify each formula matches)

These three templates encode the rules the AI prompt teaches:

- **TRIM-only on `brand`** in Target and Amazon. Brand stylization is intentional (`BISSELL`, `iPhone`). Costco's `brand` gets TITLE only because the source is `Vendor` (distributor names), not real brand text.
- **TRIM-only on `condition`**. It's a code vocabulary.
- **TRIM-only on `taxonomy.category`** and `taxonomy.category_code` and `taxonomy.gl_description`. Controlled vocabulary codes.
- **TITLE on display-text taxonomy** when the source is uniformly UPPERCASE (Target's `subcategory`, `department`, `product_class`, `seller_category`, `division`). Skip TITLE when the source is already mixed-case (Amazon's taxonomy, Costco's `seller_category`).
- **TITLE on description** only when the source is uniformly UPPERCASE (Costco). Skip when already mixed-case (Target, Amazon).

### Implementation

1. Apply the open-buckets change (Section 1) first. Templates depend on bucket validation accepting custom sub-keys (the templates only use suggested keys, but the validation has to allow custom for the AI flow).
2. Confirm vendor rows for Target, Costco, Amazon exist. Create if missing.
3. Write a data migration in `apps/inventory/migrations/` using `RunPython`. Forward function creates the three `CSVTemplate` rows with the JSON above, computed signatures, and `is_default=true`. Reverse function deletes by name+vendor.
4. Don't delete the existing test templates (ids 1, 2, 3) yet if that wipe hasn't run. If it has, fine.

---

## Tests

Add to `apps/inventory/tests/test_preprocessing_redesign.py`:

- One end-to-end test per template: fixture CSV (3-5 rows) matching the headers above, run preprocessing, assert flat fields and all four bucket dicts have expected values for one known row.
- Casing assertions: Target row's `taxonomy.department` equals `"Kitchen"` not `"KITCHEN"`. Costco row's `description` equals title-cased value not source uppercase.
- Empty handling: row with empty `UPC` cell produces `identifiers` dict without a `upc` key (not `{"upc": ""}`).
- Custom sub-key acceptance: a `column_mappings` entry with `target: "tracking.warehouse_zone"` (not in `suggested_keys`) is accepted by `normalize_standard_mappings` because tracking is `open: true`.
- Bucket prefix rejection: `target: "bogus.foo"` (unknown bucket prefix) is rejected.
- Sub-key regex: `target: "identifiers.UPC"` (uppercase) is rejected. `target: "identifiers.upc"` accepted.

Frontend tests:

- `BucketFieldEditor` modal: add a row via "+ Add Field", validates name regex, prevents duplicate names within a bucket, removes a row, saves changes back to parent state.
- `StandardManifestBuilder` bucket row: shows "X Fields" badge with correct count, "No Fields" muted when empty, click opens modal.
- Tooltip on Sample Result shows full formatted JSON when bucket has values.

---

## Out of scope for this PR

- AI suggest_formulas changes that depend on bucket-aware prompting. That's a separate task once these templates land and we have the prompt examples ready.
- Migrating any existing manifests that already ran through preprocessing. New schema applies to new ingests only.
- Updating any docs in `.ai/reference/`. Do that as a follow-up doc PR after the code lands.

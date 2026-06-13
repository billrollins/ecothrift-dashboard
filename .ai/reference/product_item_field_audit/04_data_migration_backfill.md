# 04 — Data Migration + Backfill Plan

**Purpose:** define the database-safe order of operations before constraints and field drops.

## Migration Principles

- Add new columns before rewriting callers.
- Backfill data before enforcing constraints.
- Drop retired fields only after app code and tests no longer reference them.
- Do not copy price/retail data into Product.
- Keep migration checks explicit and repeatable.
- Dirty historical data does not stop implementation. Use approved Generic/default values, log what was defaulted, and continue.

## Target Constraints

| Model | Constraint |
|-------|------------|
| `Product.title` | `NOT NULL` and non-empty. |
| `Product.brand` | `NOT NULL`; default `Generic`. |
| `Item.product` | `NOT NULL`, `on_delete=PROTECT`. |
| `Item.price` | Required. |
| `Item.condition` | Standard condition value. |
| `PreprocessingRow.ai_category` onward | Canonical category. |
| `PreprocessingRow.ai_condition` onward | Standard condition. |

## Migration Sequence

### Step 1 — Add New Product Fields

Schema:

- Add `Product.identifiers JSONField(default=dict)`.
- Add `Product.tags` JSON/list field if schema approved.
- Add indexes for Product search fields where practical.

Data:

- Copy non-empty `Product.upc` into `Product.identifiers['upc']`.
- Normalize UPC values consistently with existing matching/search behavior.
- Preserve existing identifiers if any already exist by merging keys; existing keys win only if intentionally curated.

Checks:

- Count Products with old UPC but no `identifiers.upc` after migration: `0`.
- Product search/matching smoke test finds migrated UPCs through identifiers.

### Step 2 — Add / Normalize Manifest Source Buckets

Schema:

- Ensure `ManifestRow.taxonomy` JSON exists.
- Ensure `ManifestRow.identifiers` JSON exists.
- Do not add a separate `tracking` target.

Data:

- Move/copy source category-like fields into `taxonomy`.
- Move/copy source ID/tracking-like fields into `identifiers`.
- If a raw source column is literally named `taxonomy`, store as `taxonomy['taxonomy']`.
- Map source `location` only if it is source/tracking context; do not map it to `Item.location`.

Checks:

- Template Formula target list includes `title`, not canonical `description`.
- Template Formula target list includes `taxonomy.*`, `identifiers.*`, and `specifications.*`.

### Step 2B — Remove Preprocessing Source-Copy Layers

Rewrite callers so `PreprocessingRow` no longer needs source-copy fields:

- Source identity/taxonomy/identifier/spec/tracking data is read from `ManifestRow`.
- AI cleanup writes only AI-adjusted fields.
- Final review writes only `final_*` fields.
- Finalize copies final reviewed fields to `ProcessingRow` and leaves source buckets on `ManifestRow`.

Drop after callers move:

- `standard_description`, `standard_brand`, `standard_model`, `standard_condition`, `standard_notes`
- `standard_identifiers`, `standard_taxonomy`, `standard_specifications`, `standard_tracking`, `standard_search_tags`
- `ai_identifiers`, `final_identifiers`
- `ai_taxonomy`, `final_taxonomy`
- `ai_tracking`, `final_tracking`
- `ai_search_tags`, `final_search_tags` unless Product tags implementation deliberately replaces this with Product-owned tags

### Step 3 — Rewrite App Callers To New Fields

Do this before constraints/drop:

- Product find/create/matching uses `Product.identifiers`.
- Item serializers expose Product-backed identity.
- Check-in creates Items with required Product.
- UI sends Item `retail`, not Item `unit_retail`.
- Row UI still sends row `unit_retail`.
- Product UI no longer sends `default_price`.
- Product and Item tables no longer rely on retired stats/identity columns.

Checks:

- Retired-field grep checks are clean in app code before drop.
- Full targeted backend/frontend tests pass.

### Step 4 — Null-Product Item Backfill

Goal: `Item.product_id IS NULL` count becomes `0`.

#### Backfill Inputs

For each null-product Item, build a candidate Product identity:

- Title: meaningful `Item.title` if present; else `Generic identifier {value}` when a meaningful identifier exists; else Generic Product.
- Brand: meaningful `Item.brand` if present; else `Generic`.
- Model/specifications: copy meaningful Item values if present; else blank/default.
- Category: meaningful Item category if present and canonical; else `Mixed lots & uncategorized`.
- Identifiers: collect UPC/ASIN/MPN/SKU-like data if available.

Never use:

- `Item.price`
- `Item.retail` / `Item.unit_retail`
- `Item.cost`
- sale price fields

#### Product Match Order

1. Exact identifier match in `Product.identifiers`.
2. Exact normalized identity match on `title + brand + model + category`.
3. Generic Product if identity has no meaningful title and no meaningful identifier.
4. Create/reuse uniquely titled Generic identifier Product for identifier-only rows, for example `Generic UPC {upc}`.
5. Create rough Product from Item title/brand/model/category when meaningful but unmatched.

If none of the above yields meaningful data, attach the Item to Generic Product and log the Item ID/reason. Do not stop.

#### Generic Product

Create one Generic Product before the backfill:

- `title`: `Generic Product`
- `brand`: `Generic`
- `category`: `Mixed lots & uncategorized`
- `identifiers`: `{}`
- `is_active`: true

If category is enforced through `Category`, create/reuse the `Mixed lots & uncategorized` Category row first.

#### Checks

- `SELECT COUNT(*) FROM inventory_item WHERE product_id IS NULL` returns `0`.
- Sample rough Products created from Items look acceptable.
- No Product created from Item price/retail.
- Backfill log records counts for exact identifier matches, exact identity matches, rough Products created, Generic identifier Products created, and Generic Product assignments.

### Step 5 — Rename Item Retail

Schema:

- Rename `Item.unit_retail` to `Item.retail`.

Code:

- Item APIs/types use `retail`.
- Processing row APIs keep `unit_retail`.

Checks:

- Check-in creates `Item.retail` from `ProcessingRow.unit_retail`.
- Add Item create/edit can set `retail`.
- Cost calculation still uses retail value.

### Step 6 — Enforce Product / Item Constraints

Schema:

- `Product.title` required and non-empty.
- `Product.brand` required.
- `Item.product` required.
- Change `Item.product` FK to `on_delete=PROTECT`.
- Ensure `Item.condition` and row canonical condition fields use allowed values.

Data checks before migration:

- Products with null/blank title: `0`.
- Products with null/blank brand: `0` after Generic fill.
- Items with null product: `0`.
- Items with invalid condition: `0` or explicitly mapped before constraint.

### Step 7 — Drop Retired Columns

Drop only after app-code checks pass:

Product:

- `upc`
- `default_price`
- `times_ordered`
- `total_units_received`

Item:

- `title`
- `brand`
- `unit_count`
- `processing_tier`
- `batch_group`

Processing/Manifest:

- `ProcessingRow.units_per_item`
- canonical `ManifestRow.description` target usage/column if present and no non-canonical use remains
- separate tracking bucket fields if present and replaced by `identifiers`
- retired `PreprocessingRow` source-copy and identifier/tracking/taxonomy duplicate layers

## Implementation Slice Order

Recommended implementation split:

1. Add new fields and migrations (`identifiers`, `tags`, source buckets/indexes).
2. Rewrite Product matching/search/serializers to new fields.
3. Rewrite Item identity/price/retail/check-in paths.
4. Run null-product backfill and enforce constraints.
5. Drop retired fields and old batch artifacts.

## Automatic Migration Resolution

Do not stop for missing historical data. Resolve and log:

- Any Item without assignable identity gets Generic Product.
- Any Product blank title becomes `Generic Product` or `Generic identifier {value}`.
- Any Product blank brand becomes `Generic`.
- Any Product blank/invalid category becomes `Mixed lots & uncategorized`.
- Any invalid/blank condition becomes `unknown`.
- If Product search cannot find migrated UPCs through identifiers, fix the identifier query/index/helper in the current slice.
- If check-in can create an Item without Product or without price, fix that code path and add a regression test in the current slice.
- If retired-field grep checks still show active app-code usage, rewrite those callers in the current slice before dropping the field.

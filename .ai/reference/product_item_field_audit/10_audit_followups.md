# 10 — Audit Follow-Ups

**Purpose:** consolidated findings from the backend, frontend/API, and migration/test audit passes that must stay visible during implementation.

## Backend Findings To Preserve

- Product old-field writes are still centralized in manifest build/sync, manual item resolution, processing check-in, transforms, serializers, matching, search, admin, and import/backfill commands.
- `ProductSerializer` currently uses broad model exposure; make affected serializers explicit before fields are dropped.
- `Product.tags` does not exist yet. Current search tags are mixed into specifications or row payloads; implementation must create Product-owned tags and move callers deliberately.
- `Product.identifiers` does not exist yet. Existing row identifier JSON can prefill Product identifiers, but Product lookup/search/matching still depend on flat `upc`.
- `PreprocessingRow` currently has `standard_*`, `ai_identifiers`, `final_identifiers`, `ai_tracking`, `final_tracking`, and similar source-copy/duplicate layers. These are explicit removal targets because `ManifestRow` is the standardized row.
- `ManifestRow.description` is still used as an alternate identity source in finalize/check-in/workspace paths. Target requires Template Formula to create `ManifestRow.title` and callers to stop depending on description for identity.
- `processing_finalize._bulk_create_chunk_items` and historical/import flows can create productless Items today. Implementation must create/link Product in those paths.
- `processing_ops._check_in_processing_row` is the critical enforcement point: it must never create Item without Product, must write `Item.retail` from row `unit_retail`, and must write `Item.price` from shelf/check-in price.
- `ProcessingRow.units_per_item` and `Item.unit_count` were added by migration `0060`; removal requires rewriting P9 transform/check-in logic, not only dropping fields.

## Frontend/API Findings To Preserve

- `frontend/src/types/inventory.types.ts` and `frontend/src/api/inventory.api.ts` still expose retired Product/Item fields and need to be cleaned in the same slices as backend serializers.
- Manage Products currently shows Product Price and flat UPC; Price must be removed and UPC must be displayed from `identifiers`.
- Item form create/update still writes Item identity and flat UPC. Target requires Product selection/create first, Product identifiers/tags on Product payloads, and Item-only fields on Item payloads.
- `ItemCatalogTable` must read Product-backed title/brand only; it currently has a brand path that can miss `product_brand`.
- Processing quick and detailed check-in still send flat `upc`, dual retail keys, and row/search tag naming. Target: Product `identifiers`, Product `tags`, Item `retail`, row `unit_retail`.
- Print/label paths must use Product-backed title/brand and Item price/retail. Do not depend on Item title/brand columns.
- `unitsPerItem` / `unit_count` UI and transform tests conflict with the single-unit Item model and must be removed or rewritten.
- `checkedInHistoryDisplay` already reads Product identity correctly; preserve that pattern.

## Migration / Tests / Deployment Findings To Preserve

- No drop migrations exist yet. The danger is dropping fields before all callers and backfills move.
- Management commands/imports that must be updated before drops include historical Product/manifest backfills, old data import, historical sold import, category backfills/exports, price model training, and old batch queue builders.
- Historical sold and old import paths must create/link Product instead of creating productless Items.
- `.ai/extended/sql/bulk_raise_line_prices_by_po.sql` still updates `inventory_product.default_price`; archive or rewrite before Product `default_price` is dropped.
- `.ai/extended/sql/intake_pipeline_by_order.sql` reads Item batch group data; update/archive before Item `batch_group` is dropped.
- `apps/buying/services/category_stats_sql.py` reads `Item.unit_retail`; update to `Item.retail` when the Item field is renamed.
- Printserver is safe if the API continues to provide Product-backed `product_title` / `product_brand`.
- Tests that expect productless Items, flat UPC, `default_price`, `ManifestRow.description`, `unit_count`, or `units_per_item` must be rewritten with the implementation slice that changes the behavior.

## Highest-Risk Sequencing Traps

1. Dropping `Product.upc` before `Product.identifiers` exists, data is copied, and dedup/search/matching are rewritten.
2. Enforcing `Item.product NOT NULL` before automatic Generic/default backfill and product-creating import paths are in place.
3. Dropping `ManifestRow.description` before Template Formula/title migration and caller rewrites.
4. Dropping `units_per_item` / `unit_count` before P9 transform and check-in logic are rewritten.
5. Dropping `Product.default_price` while SQL scripts, Product tables, serializers, matching snapshots, or Product create paths still reference it.
6. Leaving broad serializer field lists in place while model fields are being removed.

## Implementation Rule

These findings do not create new approval questions. They are implementation scope. If one appears during coding, fix it, use approved defaults/logging for dirty data, and continue.

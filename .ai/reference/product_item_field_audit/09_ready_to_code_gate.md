# 09 — Ready To Code Gate

**Purpose:** approved implementation gate and automatic resolution rules.

## Required Approvals

- [x] Owner approves [`00_decisions.md`](./00_decisions.md).
- [x] Owner approves [`01_target_schema.md`](./01_target_schema.md).
- [x] Owner approves [`02_field_lineage.md`](./02_field_lineage.md).
- [x] Owner approves [`04_data_migration_backfill.md`](./04_data_migration_backfill.md).

## No Open Design Questions

Before coding, confirm:

- [x] Product has no price field.
- [x] Product flat UPC is replaced by identifiers JSON.
- [x] Product tags are included as a search aid.
- [x] Product search starts with indexed multi-field/identifier/tag search.
- [x] Item product is required and protected.
- [x] Item title/brand columns are dropped.
- [x] Item retail is named `retail`.
- [x] Upstream row retail remains `unit_retail`.
- [x] Item price and Item retail are separate.
- [x] Item unit count is removed.
- [x] BatchGroup/processing tier are removed from Item target.
- [x] ManifestRow title replaces canonical description lineage.
- [x] ManifestRow taxonomy is source material for canonical category.
- [x] ManifestRow identifiers absorbs tracking-like source fields.
- [x] PreprocessingRow has only AI and final layers.
- [x] Current `PreprocessingRow.standard_*` fields are planned for removal.
- [x] Identifier/taxonomy/tracking source buckets are not AI/final-adjusted on PreprocessingRow.
- [x] Item location is internal inventory location.
- [x] Condition values are standard from `ai_condition` through Item.

## Implementation Order Accepted

- [x] Add new fields and source buckets.
- [x] Migrate UPC to Product identifiers.
- [x] Rewrite Product matching/search and Product serializers.
- [x] Rewrite Item identity, serializers, POS, reports, and search text.
- [x] Rewrite processing check-in and transform flows.
- [x] Backfill null-product Items.
- [x] Enforce Product/Item constraints.
- [x] Rename Item retail.
- [x] Drop retired fields.
- [x] Run full verification.

## Data Backfill Ready

- [x] Generic Product uses `title = Generic Product`, `brand = Generic`, `category = Mixed lots & uncategorized`, `is_active = true`.
- [x] Identifier normalization helper design in [`07_search_identifiers_tags.md`](./07_search_identifiers_tags.md) is accepted.
- [x] Null-product Item matching order in [`04_data_migration_backfill.md`](./04_data_migration_backfill.md) is accepted.
- [x] Product title/brand blank fill rules in [`04_data_migration_backfill.md`](./04_data_migration_backfill.md) are accepted.
- [x] Invalid condition values map to `unknown` before constraints.
- [x] No migration copies Item price/retail into Product.

## Code Audit Ready

- [x] Backend code areas in [`03_current_code_audit.md`](./03_current_code_audit.md) are included in implementation scope.
- [x] Frontend/API areas in [`06_frontend_api_plan.md`](./06_frontend_api_plan.md) are included in implementation scope.
- [x] Management commands/import scripts are included in scope.
- [x] POS behavior is included in scope.
- [x] Label printing behavior is included in scope.
- [x] Tests listed in [`08_testing_verification.md`](./08_testing_verification.md) are included in scope.

## Automatic Resolution Rules

Do not stop implementation for dirty historical data. Apply these rules, create a migration log entry/count, and continue:

- If a null-product Item has no meaningful identity or identifiers, attach it to the Generic Product.
- If a required Product field cannot be backfilled from source data, use approved defaults: `title = Generic Product` or `Generic identifier {value}` when an identifier exists, `brand = Generic`, `category = Mixed lots & uncategorized`, `identifiers = {}`.
- If condition is invalid or blank, map it to `unknown`.
- If Product search/matching cannot query identifiers with the first chosen DB expression, implement the next practical indexed/query helper and keep moving.
- If check-in can still create Items without Product, fix that path immediately in the current implementation slice and add a regression test.
- If UI still writes Product price or Item title/brand, remove those writes in the current implementation slice.
- If an old batch/multi-unit Item workflow appears, remove or rewrite it to single-unit Items in the current implementation slice.

## First Implementation Slice

Start with a small backend schema/data foundation slice:

- Add `Product.identifiers`.
- Add Product tags.
- Add/confirm `ManifestRow.taxonomy` and `ManifestRow.identifiers`.
- Add identifier normalization helper.
- Add migration copying `Product.upc` to `Product.identifiers['upc']`.
- Add focused tests for identifier migration/search helper behavior.

Do not drop old columns in the first slice.

## Ready Statement

Owner approved on 2026-06-13. Coding is ready. Do not create pull requests or push to GitHub from this plan.

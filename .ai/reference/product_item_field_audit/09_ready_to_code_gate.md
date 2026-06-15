# 09 — Ready To Code Gate

**Purpose:** approved implementation gate and automatic resolution rules.

## Status

The 2026-06-13 gate is superseded for category and description work by [`11_category_unification_description_removal_plan.md`](./11_category_unification_description_removal_plan.md). Do not code the reset until the unchecked items below are resolved.

## Required Approvals

- [x] Owner approves [`00_decisions.md`](./00_decisions.md).
- [x] Owner approves [`01_target_schema.md`](./01_target_schema.md).
- [x] Owner approves [`02_field_lineage.md`](./02_field_lineage.md).
- [x] Owner approves [`04_data_migration_backfill.md`](./04_data_migration_backfill.md).
- [ ] Owner approves [`11_category_unification_description_removal_plan.md`](./11_category_unification_description_removal_plan.md).
- [x] Existing docs have no remaining conflicting allowance for Product `description`, Product string `category`, `category_ref`, Item-owned category, or non-19 canonical categories.

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
- [ ] Runtime canonical categories come only from `inventory.Category`.
- [ ] `inventory.Category` is seeded/migrated to exactly the 19 prior `TAXONOMY_V1_CATEGORY_NAMES`.
- [ ] Product has exactly one category field: `category` FK to `inventory.Category`.
- [ ] Product string `category` and `category_ref` are removal targets.
- [ ] Item category is Product-backed only.
- [ ] Product description and canonical description lineage are removal targets with no compatibility alias.
- [x] ManifestRow identifiers absorbs tracking-like source fields.
- [x] PreprocessingRow has only AI and final layers.
- [x] Current `PreprocessingRow.standard_*` fields are planned for removal.
- [x] Identifier/taxonomy/tracking source buckets are not AI/final-adjusted on PreprocessingRow.
- [x] Item location is internal inventory location.
- [x] Condition values are standard from `ai_condition` through Item.

## Implementation Order Accepted

- [ ] Seed/map `inventory.Category` to the 19 canonical rows.
- [ ] Add temporary category FK migration fields where needed and backfill from deterministic mapping.
- [x] Add new fields and source buckets.
- [x] Migrate UPC to Product identifiers.
- [ ] Rewrite category callers to canonical Category FK.
- [ ] Remove Product/manifest/preprocessing/processing description callers.
- [x] Rewrite Product matching/search and Product serializers.
- [x] Rewrite Item identity, serializers, POS, reports, and search text.
- [x] Rewrite processing check-in and transform flows.
- [x] Backfill null-product Items.
- [x] Enforce Product/Item constraints.
- [x] Rename Item retail.
- [ ] Drop old Product category string, `category_ref`, Item-owned category, and description fields.
- [x] Drop retired fields.
- [x] Run full verification.

## Data Backfill Ready

- [ ] Generic Product uses `title = Generic Product`, `brand = Generic`, `category = inventory.Category("Mixed lots & uncategorized")`, `is_active = true`.
- [x] Identifier normalization helper design in [`07_search_identifiers_tags.md`](./07_search_identifiers_tags.md) is accepted.
- [x] Null-product Item matching order in [`04_data_migration_backfill.md`](./04_data_migration_backfill.md) is accepted.
- [x] Product title/brand blank fill rules in [`04_data_migration_backfill.md`](./04_data_migration_backfill.md) are accepted.
- [x] Invalid condition values map to `unknown` before constraints.
- [x] No migration copies Item price/retail into Product.
- [ ] Category migration logs non-19 category mappings/defaults.
- [ ] Description removal grep checks are defined and clean before drops.

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
- If category cannot be mapped to one of the 19 canonical rows, use `Mixed lots & uncategorized` and log the source value/count.
- If condition is invalid or blank, map it to `unknown`.
- If Product search/matching cannot query identifiers with the first chosen DB expression, implement the next practical indexed/query helper and keep moving.
- If check-in can still create Items without Product, fix that path immediately in the current implementation slice and add a regression test.
- If UI still writes Product price or Item title/brand, remove those writes in the current implementation slice.
- If an old batch/multi-unit Item workflow appears, remove or rewrite it to single-unit Items in the current implementation slice.

## First Implementation Slice

Start with category and description foundation before further Product UI work:

- Seed/map `inventory.Category` to exactly the 19 canonical rows.
- Add temporary FK columns for Product/Preprocessing/Processing category migration if needed.
- Backfill category FKs from existing Category rows/strings using deterministic mapping.
- Remove Product description from active API/UI/prompt paths before dropping the column.
- Add focused tests for category seed/mapping and Product description absence.

Do not drop old columns until caller rewrites and grep checks are clean.

## Ready Statement

Owner approved the original cleanup on 2026-06-13. The 2026-06-14 category/description reset still requires final approval after docs are reconciled. Do not create pull requests or push to GitHub from this plan.

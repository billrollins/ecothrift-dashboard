# Product / Item Field Cleanup Planning Pack

**Status:** Reset in progress for category unification + Product description removal
**Date:** 2026-06-14
**Initiative:** [`product_item_crud_and_processing`](../../initiatives/product_item_crud_and_processing.md), Phase 3
**Root summary:** [`../product_item_field_audit.md`](../product_item_field_audit.md)

## Owner Direction

- Hard cleanup. Retired fields are removed from the canonical design and every caller is rewritten to the new source of truth.
- No `Product.default_price`. Product has no price field.
- No duplicated Product identity on Item. Item reads title/brand/model/category through `Item.product`.
- One category source at runtime: `inventory.Category`, seeded to the 19 names from the prior `TAXONOMY_V1_CATEGORY_NAMES`.
- Product has exactly one category field: `Product.category` FK to `inventory.Category`.
- No `Product.category_ref`, no Product string category, and no Item-owned category in the final schema.
- No `Product.description` or canonical description lineage remains.
- No bulk Item records. Every `Item` represents exactly one physical unit.
- `ManifestRow` is the standardized layer. `PreprocessingRow` has only `ai_*` and `final_*` layers.
- All source identifier/tracking-like fields map into `ManifestRow.identifiers`; no separate `tracking` bucket.
- `Item.location` is internal inventory location, not ingest data.

## Files

| File | Purpose |
|------|---------|
| [`00_decisions.md`](./00_decisions.md) | Frozen owner decisions and non-negotiable invariants. |
| [`01_target_schema.md`](./01_target_schema.md) | Exact Product, Item, ManifestRow, PreprocessingRow, and ProcessingRow target fields. |
| [`02_field_lineage.md`](./02_field_lineage.md) | Current vs target lineage for identity, taxonomy, identifiers, pricing, quantity, location, and condition. |
| [`03_current_code_audit.md`](./03_current_code_audit.md) | Backend/frontend code areas that must be changed before old fields can be dropped. |
| [`04_data_migration_backfill.md`](./04_data_migration_backfill.md) | Data migration order, null-product backfill, UPC/identifier migration, and constraints. |
| [`05_backend_implementation_plan.md`](./05_backend_implementation_plan.md) | Backend implementation sequence by model, service, serializer, API, POS, and reports. |
| [`06_frontend_api_plan.md`](./06_frontend_api_plan.md) | Frontend/API contract changes for Product/Item pages, forms, processing, labels, and tests. |
| [`07_search_identifiers_tags.md`](./07_search_identifiers_tags.md) | Product identifiers, tags, and search design. |
| [`08_testing_verification.md`](./08_testing_verification.md) | Test plan, grep checks, migration checks, and phase exit gates. |
| [`09_ready_to_code_gate.md`](./09_ready_to_code_gate.md) | Final checklist that must be true before implementation starts. |
| [`10_audit_followups.md`](./10_audit_followups.md) | Consolidated backend/frontend/migration audit follow-ups that must stay in implementation scope. |
| [`11_category_unification_description_removal_plan.md`](./11_category_unification_description_removal_plan.md) | 2026-06-14 reset plan for one canonical category system and full Product description removal. |
| [`12_check_in_normalization.md`](./12_check_in_normalization.md) | ItemCheckIn FK normalization (0063), dual-write soak, Phase 5 JSON removal gate. |

## Coding Readiness

The original 2026-06-13 gate is superseded for category and description work. Before coding the reset, reconcile every file in this pack with [`11_category_unification_description_removal_plan.md`](./11_category_unification_description_removal_plan.md).

Rules:

1. Use Generic/default values plus logs for dirty historical data.
2. Do not stop to ask about null-product Items or missing Product fields.
3. Fix any check-in path that can create Items without Product in the current implementation slice.
4. Do not create pull requests or push to GitHub from this plan.
5. Keep [`10_audit_followups.md`](./10_audit_followups.md) in scope during implementation.
6. Treat any remaining allowance for Product `description`, `category_ref`, Product string category, Item-owned category, or non-19 canonical categories as stale text to remove before coding.

## Phase Order

| Phase | Goal | Exit |
|-------|------|------|
| 0 | Reset design freeze | Owner approves one `inventory.Category` taxonomy, Product `category` FK, and full description removal. |
| 1 | Category foundation | `inventory.Category` is seeded/mapped to exactly the 19 canonical rows. |
| 2 | Rewrite callers | Product/Item/processing/category/AI code reads/writes canonical Category FKs and no description fields. |
| 3 | Backfill and constrain | Product categories are non-null; Item categories are Product-backed; category values are canonical. |
| 4 | Drop old fields | `category_ref`, Product string category, Item-owned category, Product/manifest/preprocessing/processing descriptions, and retired fields are removed. |
| 5 | Verify | Full backend/frontend checks pass; category/description retired-field grep checks are clean outside migrations and planning docs. |

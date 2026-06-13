# Product / Item Field Cleanup Planning Pack

**Status:** Approved for coding
**Date:** 2026-06-13
**Initiative:** [`product_item_crud_and_processing`](../../initiatives/product_item_crud_and_processing.md), Phase 3
**Root summary:** [`../product_item_field_audit.md`](../product_item_field_audit.md)

## Owner Direction

- Hard cleanup. Retired fields are removed from the canonical design and every caller is rewritten to the new source of truth.
- No `Product.default_price`. Product has no price field.
- No duplicated Product identity on Item. Item reads title/brand/model/category through `Item.product`.
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

## Coding Readiness

Implementation is approved as of 2026-06-13. The coding gate is [`09_ready_to_code_gate.md`](./09_ready_to_code_gate.md).

Rules:

1. Use Generic/default values plus logs for dirty historical data.
2. Do not stop to ask about null-product Items or missing Product fields.
3. Fix any check-in path that can create Items without Product in the current implementation slice.
4. Do not create pull requests or push to GitHub from this plan.
5. Keep [`10_audit_followups.md`](./10_audit_followups.md) in scope during implementation.

## Phase Order

| Phase | Goal | Exit |
|-------|------|------|
| 0 | Design freeze | Owner approves schema, lineage, and migration order. |
| 1 | Add new sources | `Product.identifiers`, Product tags, `ManifestRow.taxonomy`, and `ManifestRow.identifiers` exist and are indexed where needed. |
| 2 | Rewrite callers | App code reads/writes the new sources only. |
| 3 | Backfill and constrain | Null-product Items fixed; Product and Item invariants enforced. |
| 4 | Rename/drop old fields | Retired fields removed from models, serializers, UI types, tests, scripts, and reports. |
| 5 | Verify | Full backend/frontend checks pass; retired-field grep checks are clean outside migrations. |

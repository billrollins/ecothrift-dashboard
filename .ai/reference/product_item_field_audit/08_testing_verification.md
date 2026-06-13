# 08 — Testing + Verification

**Purpose:** define test coverage and checks required for each phase of the cleanup.

Also keep [`10_audit_followups.md`](./10_audit_followups.md) in scope for the concrete tests, SQL files, and command paths found by the audit passes.

## Test Strategy

Use focused tests during rewrite phases, then full suites before column drops.

Coverage must prove:

- Product has no price behavior.
- Product identifiers replace flat UPC.
- Item identity reads from Product.
- Item creation requires Product.
- Item retail and Item price are separate.
- Quantity creates single-unit Items.
- Product search finds indexed fields, identifiers, and tags.
- POS/report paths read Product identity without query explosions.

## Backend Tests To Update / Add

| Test area | Required coverage |
|-----------|-------------------|
| Product matching | Identifier-based UPC match; no `default_price` in snapshot; match details expose identifiers. |
| Manual item create | Product selected/created first; Product identifiers accepted; Product price not accepted. |
| Item serializer | Product-backed read fields; no Item title/brand writes; `retail` accepted; `unit_retail` rejected for Item. |
| Processing check-in | Product required; row `unit_retail` becomes Item `retail`; shelf/check-in price becomes Item `price`; N quantity creates N Items. |
| Processing transforms | No `units_per_item` / `unit_count` behavior in v1. |
| Processing identity | Product identifiers used instead of Product UPC; row identifiers can prefill Product. |
| AI cleanup/finalize | `ManifestRow.title` path; taxonomy informs canonical `ai_category`; condition standard set. |
| POS | Cart line description uses Product title; queryset joins Product where needed. |
| Reports | Stale/unpriced/Item reports read Product-backed identity. |
| Migration tests/checks | UPC copy to identifiers; null-product Item backfill; Product title/brand constraints. |

Known files likely touched:

- `apps/inventory/tests/test_product_matching.py`
- `apps/inventory/tests/test_item_serializer.py`
- `apps/inventory/tests/test_item_create_unified.py`
- `apps/inventory/tests/test_processing_identity.py`
- `apps/inventory/tests/test_processing_transforms.py`
- `apps/inventory/tests/test_ai_cleanup_batch.py`
- `apps/inventory/tests/test_preprocessing_redesign.py`
- `apps/inventory/tests/test_processing_validation_matrix.py`
- POS tests, or add focused coverage if the current suite lacks it.

## Frontend Tests To Update / Add

| Test area | Required coverage |
|-----------|-------------------|
| Product catalog table | No price column; identifiers/tags display/search payloads. |
| Item catalog table | Product-backed title/brand display and sort behavior. |
| Item form | Requires/selects Product first; sends Item fields only; sends `retail`. |
| Processing check-in dialog | Product modes; retail vs price payload; no `unit_count`. |
| Processing transforms | Remove `unitsPerItem` expectations. |
| Print label | Product-backed title/brand; Item price; identifier from Product identifiers. |
| Workspace filters | Identifier search through Product identifiers. |

Known files likely touched:

- `frontend/src/pages/inventory/processing/processingQueueCellText.test.ts`
- `frontend/src/pages/inventory/processing/processingTransformPrice.test.ts`
- `frontend/src/utils/aiCleanupPool.ts` tests if impacted
- `checkedInHistory.test.ts` when present in the current frontend suite
- `processingWorkspaceFilters.test.ts` when present in the current frontend suite
- New tests for Product/Item manage pages if coverage is missing.

## Grep Checks

Run after caller rewrites and before field drops. Exclude migrations and planning docs when checking app code.

Product old fields:

- `default_price`
- `Product.upc`
- `product__upc`
- `.upc`
- `times_ordered`
- `total_units_received`

Item old fields:

- `Item.title`
- `item.title`
- `Item.brand`
- `item.brand`
- `unit_count`
- `unit_retail` in Item-owned contexts
- `processing_tier`
- `batch_group`
- `BatchGroup`

Processing/Manifest old concepts:

- `units_per_item`
- `unitsPerItem`
- `ManifestRow.description`
- separate `tracking` target usage
- `standard_*` fields on `PreprocessingRow`
- `ai_identifiers`, `final_identifiers`, `ai_tracking`, `final_tracking`
- preprocessing wording that implies layers other than `ai_*` and `final_*`

Expected:

- Row-level `unit_retail` remains for `ManifestRow`, `PreprocessingRow`, and `ProcessingRow`.
- `title`/`brand` remain on Product, ManifestRow, PreprocessingRow, and ProcessingRow.
- `description` can remain on Product as manual/catalog detail.
- Historical migrations may still contain old fields.

## Data Checks

Before constraints:

- Products with blank/null title: `0`.
- Products with blank/null brand: `0`.
- Items with null product: `0`.
- Products with flat UPC not copied to identifiers: `0`.
- Items with invalid condition: `0`.
- Rows with non-canonical final category after AI/finalize: `0` or intentionally mapped.

Before field drops:

- App code old-field grep is clean.
- Frontend types old-field grep is clean.
- API responses no longer require retired fields.
- Historical commands that still reference old columns are updated or removed.

## Phase Verification

| Phase | Checks |
|-------|--------|
| 0 — Design freeze | Owner approves decisions/schema/lineage/migration order. |
| 1 — Add new sources | Migration applies; UPCs copied to identifiers; Product search smoke test by UPC/title/brand/category/tags. |
| 2 — Rewrite callers | Targeted backend tests pass; frontend typecheck/tests pass for changed areas; grep shows no new writes to retired fields. |
| 3 — Backfill/constrain | Null-product Item count is `0`; constraints apply cleanly; POS smoke test passes. |
| 4 — Drop old fields | App-code grep clean; migrations apply from clean DB and current DB; targeted tests pass. |
| 5 — Full verification | Full inventory backend tests; frontend test suite/typecheck; manual Product/Item/check-in/POS smoke tests. |

## Suggested Commands

Backend:

```powershell
python manage.py test apps.inventory
python manage.py test apps.pos
```

Frontend:

```powershell
npm run test
npm run typecheck
```

If this repo uses different exact commands at implementation time, use the package scripts and Django test runner currently configured in the repo.

## Manual Smoke Tests

- Create Product with identifiers and tags.
- Search Product by title, brand, model, category, UPC, and tag.
- Create Item by selecting existing Product.
- Check in ProcessingRow with quantity > 1 and confirm it creates one Item per unit.
- Confirm checked-in Items display Product-backed title/brand.
- Print label and confirm Product title/brand plus Item price.
- Add Item manually and confirm Product is required.
- Attempt Product delete with Items and confirm it is blocked.

## Done Criteria

- Tests prove every owner decision that can break behavior.
- Data checks pass before constraints.
- Grep checks pass before drops.
- Manual smoke tests pass after full migration.

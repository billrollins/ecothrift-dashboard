# 03 — Current Code Audit

**Purpose:** identify code areas that must be rewritten before schema cleanup can safely drop or rename fields.

This file is an implementation checklist, not a design document. Use it to drive code search and PR scoping.

## High-Risk Rewrite Areas

### `Item.title` / `Item.brand` Removal

Target: Item no longer stores Product identity. Reads become Product joins/serializer virtual fields; writes are removed.

| Area | Files / symbols | Required change |
|------|-----------------|-----------------|
| Model search text | `apps/inventory/models.py`, `Item.rebuild_search_text()` | Read Product identity through `item.product`; ensure query paths use `select_related('product')` where bulk saves/search rebuilds need Product fields. |
| Processing check-in | `apps/inventory/processing_ops.py` | Stop copying row title/brand to Item. Resolve/create Product first, then create Item with `product`. |
| Old manifest sync/import paths | `apps/inventory/views.py` manifest/create/sync flows | Stop writing Item title/brand. Route identity into Product only. |
| Serializers | `apps/inventory/serializers.py`, Item serializers | Replace stored Item fields with read-only Product-backed fields where API needs `title`/`brand`. Remove write acceptance. |
| POS | `apps/pos/views.py` cart/line description paths | Read `item.product.title`; use `select_related('product')` for cart item query paths. |
| Store/report views | `apps/inventory/views.py` stale/unpriced reports | Read Product identity or annotate from Product. |
| Pricing/AI services | `train_price_model.py`, `ai_listing_context.py`, `price_estimator.py`, `resale_duplicate.py` | Update feature/context builders to use Product identity. |
| Frontend Item form/table | `frontend/src/components/inventory/ItemForm.tsx`, `frontend/src/pages/inventory/manage/ItemCatalogTable.tsx` | Remove Item identity writes; display Product-backed fields; require/select Product first. |
| Print labels | `printProcessingLabel.ts`, `localPrintService.ts` | Use Product-backed item fields or Product data from API DTOs. |

Must be true before drop:

- No app-code assignment to `Item.title` or `Item.brand`.
- No serializer create/update path accepts `title` or `brand` as Item-owned fields.
- All Item list/detail APIs still expose whatever UI/POS needs from Product.

### `Product.default_price` Removal

Target: Product has no price source.

| Area | Files / symbols | Required change |
|------|-----------------|-----------------|
| Product creation/resolution | `apps/inventory/views.py`, `apps/inventory/services/manual_item.py`, `apps/inventory/processing_ops.py`, `processing_transforms.py` | Remove `default_price` args, writes, update logic, and returned payload fields. |
| Item serializer price routing | `apps/inventory/serializers.py` | Item price must be explicit or from row/check-in path; never Product. |
| Product snapshots/matching | `apps/inventory/services/product_matching.py` | Remove price from Product snapshot shape. |
| Product table/frontend type | `ProductCatalogTable.tsx`, `inventory.types.ts` | Remove Product price display/sort/edit. |
| Tests | Product matching, item serializer, processing identity/check-in tests | Update expected snapshots/payloads. |

Must be true before drop:

- `Product.default_price` is not read or written by app code.
- Check-in refuses or handles missing Item price at the Item/row level.
- No frontend sends `default_price`.

### `Product.upc` To `Product.identifiers`

Target: flat `Product.upc` moves to `Product.identifiers['upc']`.

| Area | Files / symbols | Required change |
|------|-----------------|-----------------|
| Dedup/find-or-create | `views.py`, `manual_item.py` | Rewrite UPC-first lookup to identifier lookup. Normalize identifier keys/values. |
| Product matching | `product_matching.py` | Match via `identifiers['upc']` and other identifier keys. |
| Workspace DTOs/search | `processing_workspace.py`, `processing_search_string.py` | Read Product identifiers; stop preferring flat `upc`. |
| Item search | `Item.rebuild_search_text()`, `ItemViewSet.search_fields` | Use Product identifiers through JSON/search helper. |
| Forms/tables/types | Product and Item frontend components/types | Replace `upc` scalar with identifiers editor/display or computed `product_upc` read field. |
| Import/backfill scripts | Historical import/backfill commands | Move old `upc` writes to `identifiers`. |

Must be true before drop:

- Data migration copies every meaningful `upc` into `identifiers['upc']`.
- Product search/match can find by UPC through identifiers.
- Flat `upc` is absent from non-migration app code.

### `Item.unit_count` / `ProcessingRow.units_per_item` Removal

Target: no multi-unit Item records in v1.

| Area | Files / symbols | Required change |
|------|-----------------|-----------------|
| Models | `ProcessingRow.units_per_item`, `Item.unit_count` | Remove after callers are rewritten. |
| Check-in | `processing_ops.py` | Create one Item per unit. Do not stamp `unit_count`. |
| Transform service | `processing_transforms.py` | Remove or simplify break-apart/make-set logic that relies on units per Item. |
| Workspace API | `processing_workspace.py` | Remove `unit_count`/`unitsPerItem` DTO fields. |
| Serializers/types | `serializers.py`, `inventory.types.ts` | Remove fields. |
| Tests | `test_processing_transforms.py` and workspace tests | Rewrite assertions around quantity and single-unit Items. |

Must be true before drop:

- Quantity still controls check-in count.
- No code path can create one Item representing multiple units.
- UI no longer exposes `unitsPerItem`.

### `PreprocessingRow.standard_*` And Identifier/Tracking Layer Cleanup

Target: `ManifestRow` is the standardized row. `PreprocessingRow` keeps AI and final layers for fields that staff/AI actually adjust. Source identifiers/taxonomy stay on `ManifestRow`.

| Area | Files / symbols | Required change |
|------|-----------------|-----------------|
| Model fields | `apps/inventory/models.py`, `PreprocessingRow.standard_description`, `standard_brand`, `standard_model`, `standard_condition`, `standard_notes`, `standard_identifiers`, `standard_taxonomy`, `standard_specifications`, `standard_tracking`, `standard_search_tags` | Remove after callers read standardized values from `ManifestRow`. |
| AI cleanup write contract | `apps/inventory/services/ai_cleanup.py`, `apply_cleanup_values()` and prompt/context builders | Stop copying source identifiers/taxonomy/tracking into AI/final layers. Only AI-adjust fields that need cleanup. |
| Layer helpers | `apps/inventory/layer_helpers.py` | Remove standard-layer assumptions for target fields; preserve helper behavior only for AI/final layers. |
| Preprocessing review/finalize | `processing_finalize.py`, review serializers/views/tests | Finalize from `final_*` where user-reviewed; source buckets remain on `ManifestRow`. |
| Tests | preprocessing redesign / AI cleanup tests | Update fixtures and assertions away from `standard_*`, `ai_tracking`, and final tracking/identifier layers. |

Must be true before drop:

- `PreprocessingRow` no longer stores source-copy standard fields.
- Identifier/tracking-like source values live in `ManifestRow.identifiers`.
- Source taxonomy lives in `ManifestRow.taxonomy`.
- AI cleanup still produces canonical `ai_category` and standard `ai_condition`.

### `Item.unit_retail` Rename To `Item.retail`

Target: upstream remains `unit_retail`; Item endpoint/model becomes `retail`.

| Area | Files / symbols | Required change |
|------|-----------------|-----------------|
| Model/migrations | `Item.unit_retail` | Rename column to `retail`. |
| Processing check-in | `processing_ops.py` | Write `Item.retail` from `ProcessingRow.unit_retail`. |
| Serializers/API | Item serializers | Expose `retail`; stop exposing Item `unit_retail`. |
| Frontend forms/types | Item form, detailed check-in, processing types | Use `retail` for Item payloads; keep row `unit_retail` where row data is edited. |
| Cost calculation | `compute_item_cost(retail)` call sites | Use renamed Item value without changing cost semantics. |

Must be true before rename:

- Every Item API consumer knows `retail`.
- Row-level APIs still clearly use `unit_retail`.
- Price and retail remain separate in UI labels and payloads.

## Medium-Risk Areas

### Product Search

Target: token-AND search across indexed Product fields, identifiers JSON values, and tags.

Required changes:

- Add Product `tags`.
- Add practical indexes for `product_number`, `title`, `brand`, `model`, `category`, and JSON identifiers/tags where supported.
- Keep API search param stable (`search`).
- Avoid adding `Product.search_string` unless measured search is too slow.

### Serializer/API Contract

Required changes:

- Replace broad `fields = '__all__'` on affected serializers with explicit field lists where needed.
- Add read-only Product-backed Item fields where the API needs display text.
- Remove write-only retired fields from request payloads.
- Update OpenAPI/TypeScript types in the same phase as serializer changes.

### Product Delete / Merge

Required changes:

- `Item.product` becomes `PROTECT`.
- Existing Product delete endpoints must return a clear blocked-delete response if Items exist.
- Product merge/reassign flow is needed before deleting Products that have Items. It can be minimal but must be designed before exposing destructive UI.

### Category Constraints

Required changes:

- Decide exact implementation form for canonical categories before migrations: string choices, Category FK, or a staged migration using both with a final owner.
- AI cleanup must never emit arbitrary vendor taxonomy into canonical category fields.

## Low-Risk / Cleanup Areas

| Field | Action |
|-------|--------|
| `Product.times_ordered` | Remove from serializers/workspace displays; drop or recompute/report later. |
| `Product.total_units_received` | Remove from serializers/workspace displays; drop or recompute/report later. |
| `Item.processing_tier` | Remove old batch field. |
| `Item.batch_group` | Remove old batch field and old `BatchGroupViewSet` if no longer used. |
| `ManifestRow.description` | Remove canonical title/identity usage. Template Formula writes `title`. |
| separate row tracking bucket | Remove target usage; use `ManifestRow.identifiers`. |

## Cross-Cutting Files To Audit During Implementation

Backend:

- `apps/inventory/models.py`
- `apps/inventory/serializers.py`
- `apps/inventory/views.py`
- `apps/inventory/processing_ops.py`
- `apps/inventory/services/manual_item.py`
- `apps/inventory/services/product_matching.py`
- `apps/inventory/services/processing_workspace.py`
- `apps/inventory/services/processing_transforms.py`
- `apps/inventory/services/processing_search_string.py`
- `apps/inventory/services/ai_listing_context.py`
- `apps/inventory/services/price_estimator.py`
- `apps/inventory/services/resale_duplicate.py`
- `apps/pos/views.py`

Frontend:

- `frontend/src/types/inventory.types.ts`
- `frontend/src/api/inventory.api.ts`
- `frontend/src/components/inventory/ItemForm.tsx`
- `frontend/src/pages/inventory/manage/ProductCatalogTable.tsx`
- `frontend/src/pages/inventory/manage/ItemCatalogTable.tsx`
- `frontend/src/pages/inventory/processing/ProcessingCheckInDialog.tsx`
- `frontend/src/pages/inventory/processing/ProcessingTransformDialogs.tsx`
- `frontend/src/pages/inventory/processing/printProcessingLabel.ts`
- `frontend/src/services/localPrintService.ts`

Scripts/tests:

- Historical import/backfill management commands.
- Product matching tests.
- Item serializer/create tests.
- Processing identity/check-in/transform tests.
- Frontend processing workspace and catalog tests.

## Required Search Checks Before Dropping Columns

Run code searches outside migrations for:

- `default_price`
- `.upc`, `product__upc`, `Product.upc`
- `item.title`, `Item.title`, `"title"` in Item serializers/payloads
- `item.brand`, `Item.brand`, `"brand"` in Item serializers/payloads
- `unit_retail` in Item-owned contexts
- `unit_count`, `units_per_item`, `unitsPerItem`
- `processing_tier`, `batch_group`, `BatchGroup`
- `ManifestRow.description`, `.tracking`, `"tracking"`

Expected result before final drop: only migration/history docs or intentionally retained row-level fields remain.

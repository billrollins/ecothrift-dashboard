# Product & Item Field Change — Design + Audit Report

**Status:** Approved for coding
**Date:** 2026-06-13
**Initiative:** [product_item_crud_and_processing](../initiatives/product_item_crud_and_processing.md) (Phase 3 — Schema / field cleanup)
**Scope:** Design freeze + code audit only — no model/API/UI changes in this document.

**Planning pack:** [`product_item_field_audit/`](./product_item_field_audit/README.md) is the split plan source for decisions, target schema, lineage, migration/backfill, backend/frontend work, testing, and the ready-to-code gate.

**Owner direction:** hard cleanup, no compatibility crutches. Retired fields are removed from the canonical design and every caller must be rewritten to the new source of truth; no `default_price` hint, no shadow-read path, no long-term old-field support.

---

## 1. Exact new design

### Product — KEEP (canonical identity)

- `product_number` (stable, human-readable Product system ID)
- `title`, `brand`, `model`, `category`
- no `description`; Product description is removed everywhere
- `specifications` (JSON)
- `tags` (AI-suggested/search aid; name can be `tags` / `search_tags`, final schema TBD)
- `is_active`

### Product — ADD

- `identifiers` (JSONField, default dict) — UPC/ASIN/item number/SKU/MPN/EAN/GTIN/etc.; `upc` value migrates to `identifiers['upc']`

### Product — RETIRE (phased)

- `upc` column → replace with `identifiers['upc']`
- `default_price` → remove entirely from Product and every price path
- `times_ordered` → stop surfacing (recompute-only; drop candidate)
- `total_units_received` → stop surfacing (drop candidate)

### Item — KEEP (owns)

- `sku`, `product` (FK), `purchase_order`, `manifest_row`
- `price`, `retail`
- `status`, `condition`, `location`
- `specifications`
- `listed_at`, `checked_in_at`/`checked_in_by`, `sold_at`, `sold_for`
- `notes`; dispute fields (`dispute_type`, `dispute_pct_loss`, `dispute_description`)

### Item — RETIRE (phased)

- `title` → derive from `product.title` (computed/virtual; stop writing)
- `brand` → derive from `product.brand`
- `unit_retail` → rename to `retail`
- `unit_count` → remove; every `Item` represents exactly 1 unit
- `processing_tier` → old batch artifact; remove with BatchGroup deprecation
- `batch_group` (FK) → old batch artifact; collapse lives on `ProcessingRow`

### Owner decisions (design freeze inputs)

| # | Topic | Decision |
|---|-------|----------|
| 1 | `default_price` | Remove fully. Product has no price source. |
| 2 | Canonical category representation | One runtime source: `inventory.Category`, seeded to the 19 prior `TAXONOMY_V1_CATEGORY_NAMES`. `Product.category` is a FK. Remove Product string category, `category_ref`, and Item-owned category. |
| 3 | `is_active` in Manage Products table | Keep. |
| 4 | `Item.cost` | Defer; computed/view later. |
| 5 | BatchGroup + `BatchGroupViewSet` | Remove with old batch fields. |
| 6 | Brand constraint | Brand exists only on Product, ManifestRow, PreprocessingRow, and ProcessingRow; not on Item. Product brand should be non-empty (`'Generic'` when unknown). |
| 7 | Product delete semantics | `Item.product` uses `PROTECT`; Product cannot be deleted while Items exist. |
| 8 | Force Product on every Item | Yes. Items cannot exist without Product. |
| 9 | Description vs title at standardize | Template Formula creates `ManifestRow.title`; remove canonical `ManifestRow.description`. |
| 10 | ManifestRow category source | `ManifestRow.taxonomy` stores vendor/source category fields (`department`, `gl_category`, `seller_category`, etc.); it is source material, not canonical category. |
| 11 | Rename `Item.unit_retail` → `retail` | Yes. |
| 12 | `Item.unit_count` | Remove. All Items represent 1 unit. |
| 13 | Product search implementation | Do not add `Product.search_string` for now. Search across indexed Product fields, identifiers JSON, and tags; add denormalized search only if profiling proves it necessary. |
| 14 | Identifier lineage | Manifest source fields for IDs/tracking go into one JSON bucket: `ManifestRow.identifiers`. They are not AI-adjusted in preprocessing/processing; they can prefill Product identifiers on Product creation. |
| 15 | Preprocessing layer model | `ManifestRow` is the standardized row. `PreprocessingRow` has only `ai_*` and `final_*`; `ProcessingRow` has plain fields. |

---

## 1A. Single-source constraints + identity lineage

**Goal:** every field has exactly one canonical source at the point it is consumed. No `Product.title` vs `Item.title`, no `Item.price` vs `Product.default_price`, and no old-field shadow reads.

### Constraints

| Field | Constraint | Rationale |
|-------|------------|-----------|
| `Product.title` | `NOT NULL` + `CheckConstraint(title <> '')` | Single source of title |
| `Product.brand` | `NOT NULL`, default `'Generic'` | Always present |
| Product price | No canonical price on Product | Retail on `Item.retail`; shelf/tag price on row/`Item.price` |
| `Item.product` | `NOT NULL` FK, `on_delete=PROTECT` | Today: `SET_NULL, null=True` ([models.py](../../apps/inventory/models.py) ~1101) |
| `Item.title` / `Item.brand` | Drop columns | Serializer: read-only `source='product.title'` / `'product.brand'` |
| `Item.price` | `NOT NULL`; set at check-in | Product has no price source |
| `Item.retail` | Rename from `unit_retail` | Retail/MSRP; separate from shelf/tag `price` |
| `Item.unit_count` | Drop column | Every Item represents exactly 1 physical unit for now |
| Canonical category | `PreprocessingRow.ai_category` must resolve to one of the 19 `inventory.Category` rows; `final_category`, `ProcR.category`, and `Prod.category` remain canonical Category references | Implementation fixed: use `inventory.Category` as the runtime source and `Product.category` FK |
| Condition | `PreprocessingRow.ai_condition`, `final_condition`, `ProcR.condition`, and `Item.condition` must be in the standard condition set | Use existing allowed condition enum / constraint from AI cleanup onward |

### Corrected identity lineage (`>` = informs / feeds next stage)

Template Formula creates `ManifestRow.title` directly, and there is no canonical `ManifestRow.description`.

- **Title:** `ManifestRow.title` `>` `PreprocessingRow.ai_title` `>` `final_title` `>` `ProcessingRow.title` `>` `Product.title` `>` Item reads Product
- **Brand:** `ManifestRow.brand` `>` `PreprocessingRow.ai_brand` `>` `final_brand` `>` `ProcessingRow.brand` `>` `Product.brand` `>` Item reads Product

Row layers = staging identity; Product = canonical identity; Item = none.

### Extra cost from constraints

- **Backfill:** every Item must have a Product before `NOT NULL`/`PROTECT` (old + `import_historical_sold` may have null product).
- **Product delete:** `PROTECT` blocks delete when Items exist → product merge/reassign flow required.
- **Create-site audit:** Add Item and Check In Item must start from a Product, then create Item(s) from that Product. This is the reason `Item.product` cannot be null.
- **POS:** `CartLine.description = item.title` ([pos/views.py](../../apps/pos/views.py) ~517) → `item.product.title`. Keep POS fast by joining Product in the queryset (for example, `select_related('product')`) anywhere POS needs Product fields, so `item.product.title` does not become an N+1 query.
- **Search:** `Item.rebuild_search_text()` ([models.py](../../apps/inventory/models.py) ~1188–1224) → read from product.

### Null-product Item backfill strategy

Owner direction: this can be simple and ugly if needed. For every existing `Item` with `product_id IS NULL`, attach a Product using the best meaningful data available. The goal is to make the invariant true, not preserve historical ambiguity.

- Create one **Generic Product** at the start of the migration for items with no meaningful identity.
- Build a candidate identity from the Item:
  - Title: meaningful `Item.title`; else if an identifier exists, `Generic UPC {upc}` / `Generic identifier {value}`; else blank.
  - Brand: meaningful `Item.brand`; else `'Generic'`.
  - Model/category/specifications: copy meaningful Item values; else blank/default.
  - Identifiers: copy UPC/ASIN/MPN/SKU-like values into `Product.identifiers`.
- Reuse an existing exact Product before creating a new one. Exact match order:
  1. Identifier match: same normalized UPC/ASIN/MPN/etc. in `Product.identifiers`.
  2. Identity match: same normalized `title + brand + model + category`.
  3. If the candidate lacks meaningful title/identifier data, use the pre-created Generic Product.
- If the candidate has only Generic identity plus an identifier, create/reuse a uniquely titled Product like `Generic UPC {upc}` and store that UPC in identifiers.
- Never copy `Item.price` or `Item.retail` into Product.
- After backfill: `SELECT COUNT(*) FROM item WHERE product_id IS NULL` must be `0`.

---

## 1B. Field lineage matrix + deviations

### Canonical pattern

`Raw CSV (template formula)` `>` `ManifestRow.field` (standardize) `>` `PreprocessingRow.ai_field` (AI cleanup) `>` `final_field` (Finalize / Final Review) `>` `ProcessingRow.field` `>` `Product.field` OR `Item.field`.

**Structural note:** standardized values are **`ManifestRow.field`** values. After standardization, `PreprocessingRow` owns only `ai_*` and `final_*`; `ProcessingRow` owns plain `field` values.

### Conforming fields

- `brand`, `model` → `Product` (full triple)
- `condition` → `Item`; from `ai_condition` onward it must use the standard condition set
- `description` → current path only; proposed target removes `ManifestRow.description` from standardization
- `notes` → `Item.notes`; `specifications` → `Product` + `Item`

### Deviations (why / OK)

| Field | Actual flow | Why | OK? |
|-------|-------------|-----|-----|
| title | Current: `MR.description` → `ai_title` → `final_title` → `ProcR.title` → `Prod.title`; proposed: `MR.title` → `ai_title` → `final_title` → `ProcR.title` → `Prod.title` | Template Formula should create the sellable Title directly | Yes |
| retail | Current `unit_retail`: flat, AI-locked: `Raw.unit_retail` → `MR.unit_retail` → `PR.unit_retail` → `ProcR.unit_retail` → `Item.unit_retail` (+ cost); proposed changes only the Item endpoint to `Item.retail` | Vendor unit retail/MSRP authoritative while quantity exists; separate from tag price | Yes |
| price (shelf) | `proposed_price` + `final_price` → `ProcR.shelf_price` → `Item.price` | Internal pricing decision | Yes |
| category | `ManifestRow.taxonomy` gathers vendor/source category-like fields; `PreprocessingRow.ai_category` produces the canonical EcoThrift category; `final_category` → `ProcR.category` → `Prod.category` stay canonical | Vendor category fields are inputs; AI maps them to EcoThrift category | Yes |
| quantity | `MR.quantity` → `ProcR.quantity` → item loop count | Not a Product/Item attribute | Yes |
| identifiers | Manifest source bucket for UPC/ASIN/item number/SKU/lot/pallet/LPN/location/etc. Target: no AI/final adjustment in preprocessing/processing; use as source data and Product prefill when appropriate. | External IDs and source tracking data shouldn't be hallucinated | Yes |
| search_tags | Current row-level tags are unclear. Target: Product can own AI-suggested `tags`; Product search can use tags directly without a pre-concatenated search string. | Tags are search aids, not identity | Yes |
| sku / product_number | Generated at creation | Human-readable system IDs for operations; not raw database IDs | Yes |

### Corrected retail vs price routing ([processing_ops.py](../../apps/inventory/processing_ops.py) 466–469)

- Current: `Item.unit_retail` ← `ProcessingRow.unit_retail` (check-in prefill)
- Proposed: `Item.retail` ← `ProcessingRow.unit_retail`
- `Item.price` ← `shelf_price` / `final_price` lineage — **not** `unit_retail`
- `Item.cost` ← `compute_item_cost(retail)` until cost is moved to computed view

### Description vs title at standardize

- **Owner decision:** Option B. Template Formula creates a **Title**, not a Description. `ManifestRow` keeps `title`; canonical design removes `ManifestRow.description`.
- `Product.description` is removed. Use `title`, `notes`, `specifications`, `identifiers`, or `tags` instead of preserving catalog description.

---

## 1C. Per-field lineage — Current vs Proposed (one line each)

Legend: `Raw` = mapped CSV · `MR` = ManifestRow · `PR` = PreprocessingRow · `ProcR` = ProcessingRow · `Prod` = Product · `Item` = Item · `>` = informs.

### Identity (→ Product; Item reads Product)

| Field | Current | Proposed |
|-------|---------|----------|
| title | `Raw.description(req)\|Raw.title(opt) > MR.description\|MR.title > PR.ai_title > PR.final_title > ProcR.title > Prod.title > Item.title` | `Raw.title > MR.title > PR.ai_title > PR.final_title > ProcR.title > Prod.title` (Item reads Prod; drop Item.title) |
| brand | `Raw.brand > MR.brand > PR.ai_brand > PR.final_brand > ProcR.brand > Prod.brand > Item.brand` | `Raw.brand > MR.brand > PR.ai_brand > PR.final_brand > ProcR.brand > Prod.brand` (drop Item.brand) |
| model | `Raw.model > MR.model > PR.ai_model > PR.final_model > ProcR.model > Prod.model` | same |
| description | current code has Product/manifest/preprocessing/processing description fields | removed everywhere; no Product description and no canonical description lineage |

### Classification

| Field | Current | Proposed |
|-------|---------|----------|
| category | `Raw source columns (department/gl_category/seller_category/category/etc.) > MR.taxonomy + MR.category(flat) > PR.ai_category > PR.final_category > ProcR.category > Prod.category` | `Raw source columns (department/gl_category/seller_category/category/taxonomy/etc.) > MR.taxonomy(JSON source fields) > PR.ai_category (required canonical) > PR.final_category > ProcR.category > Prod.category` |
| taxonomy (vendor/source) | `Raw source columns > MR.taxonomy > (informs PR.ai_category)` | `Raw source columns > MR.taxonomy` only; if a vendor has a raw `taxonomy` column it becomes `MR.taxonomy.taxonomy`. Taxonomy remains source material for AI category, not a Product field |
| search_tags / tags | current row-level `search_tags` exist, but target Product owns tags | `AI/manual Product.tags`; optionally source from ManifestRow identifiers/tags, but Product owns final tags |

### Identifiers

| Field | Current | Proposed |
|-------|---------|----------|
| identifiers / upc / asin / item number / sku / tracking-like fields | Current code has split identifier/tracking buckets on Manifest/Preprocessing/Processing rows, plus flat `Prod.upc` | `Raw identifier/tracking-like fields > MR.identifiers(JSON source fields) > Product.identifiers(JSON prefill on Product creation/manual edit when relevant)` (drop Prod.upc and any separate tracking bucket; no AI/final row adjustment) |

### Pricing (separate tracks)

| Field | Current | Proposed |
|-------|---------|----------|
| retail | `Raw.unit_retail > MR.unit_retail > PR.unit_retail > ProcR.unit_retail > Item.unit_retail (+ Item.cost)` | `Raw.unit_retail > MR.unit_retail > PR.unit_retail > ProcR.unit_retail > Item.retail (+ cost until cost view)` |
| proposed_price | `(AI) > PR.proposed_price > ProcR.proposed_price > (review only)` | same **(D: drop if unused)** |
| final_price | `PR.final_price > MR.final_price > ProcR.final_price > ProcR.shelf_price > Item.price` | `PR.final_price > ProcR.shelf_price > Item.price` |
| shelf_price | `ProcR.shelf_price > Item.price` | same |
| default_price | `row shelf\|final\|proposed > Prod.default_price > Item.price (old path)` | removed entirely; `Item.price` comes only from `ProcR.shelf_price/final_price` |
| cost | `compute_item_cost(unit_retail) > Item.cost` | defer (computed view) |

### Quantity / units / placement

| Field | Current | Proposed |
|-------|---------|----------|
| quantity | `Raw.quantity > MR.quantity > PR.quantity > ProcR.quantity > (item loop count)` | `Raw.quantity > MR.quantity > PR.quantity > ProcR.quantity`; Item has no quantity field |
| unit_count | `ProcR.units_per_item > Item.unit_count` | removed; all Items represent exactly 1 unit |
| location | current code can read source location/tracking values | no ingest lineage; `Item.location` is internal inventory location set from dispatch/check-in |
| condition | `Raw.condition > MR.condition > PR.ai_condition > PR.final_condition > ProcR.condition > Item.condition` | same; values constrained to standard condition set from `ai_condition` onward |
| notes | `Raw.notes > MR.notes > PR.ai_notes > PR.final_notes > ProcR.notes > Item.notes` | same |
| specifications | `Raw.specifications.* > MR.specifications > PR.ai_specifications > PR.final_specifications > ProcR.specifications > Prod + Item` | same |

### Linkage / system-generated

| Field | Current | Proposed |
|-------|---------|----------|
| product (FK) | `PR.final_matched_product > ProcR.matched_product > Item.product (nullable, SET_NULL)` | `PR.final_matched_product > ProcR.matched_product > Item.product (NOT NULL, PROTECT)` |
| sku | `(generated at Item.save) > Item.sku` | same; human-readable Item system ID |
| product_number | `(generated at Prod.save) > Prod.product_number` | same; human-readable Product system ID |
| status | `(check-in) > Item.status` | same |
| source | `(check-in default purchased) > Item.source` | same |
| lifecycle timestamps | `(check-in + lifecycle) > Item.*` | same |
| dispute fields | `(processing dispute) > Item.dispute_*` | same |

### Stats / flags (Product)

| Field | Current | Proposed |
|-------|---------|----------|
| times_ordered | `(ensure_manifest ProcR count) > Prod.times_ordered` | removed |
| total_units_received | `(ensure_manifest Item count) > Prod.total_units_received` | removed |
| is_active | `Prod.is_active (manual)` | keep |

### Old batch flow (retire)

| Field | Current | Proposed |
|-------|---------|----------|
| processing_tier | `MR qty/price heuristic > Item.processing_tier` | removed |
| batch_group | `BatchGroup > Item.batch_group` | removed |

### Preprocessing-only (never reach Product/Item)

| Field | Current | Proposed |
|-------|---------|----------|
| pricing_stage / pricing_notes / batch_flag | `MR / PR / ProcR only` | unchanged |

---

## 2. Risk register (code audit)

### HIGH — deeply coupled; single-source rewrites required

#### Item.title / Item.brand removal

| Area | File | Lines | Usage |
|------|------|-------|-------|
| Model search blob | `apps/inventory/models.py` | 1128–1129, 1188–1224 | `rebuild_search_text()` reads/writes title/brand on every save |
| Check-in write | `apps/inventory/processing_ops.py` | 476–477, 1280–1281, 1829–1830, 1875 | Copies title/brand onto Item; rewrite to Product-only |
| Old manifest sync | `apps/inventory/views.py` | 1119–1120, 1152–1153, 1317–1318, 1500–1501 | `_row_listing_title/brand` → Item; rewrite/remove |
| Serializer | `apps/inventory/serializers.py` | 841, 880–902, 963 | Read/write on ItemSerializer, ItemPublicSerializer |
| POS | `apps/pos/views.py` | 504, 517, 583 | `CartLine.description = item.title`; rewrite to Product and use `select_related('product')` for speed |
| Store report | `apps/inventory/views.py` | 7544–7557 | Lists stale/unpriced items by title/brand |
| Price ML | `apps/inventory/management/commands/train_price_model.py` | 175, 184–196 | Training features |
| AI context | `apps/inventory/services/ai_listing_context.py` | 85–134 | Example rows |
| Price estimator | `apps/inventory/services/price_estimator.py` | 159, 171 | Comparables |
| Resale duplicate | `apps/inventory/services/resale_duplicate.py` | 33–34 | Copies title/brand |
| Frontend ItemForm | `frontend/src/components/inventory/ItemForm.tsx` | 379–408, 510–513, 1138–1174 | Form fields + create/update payload |
| Frontend tables | `frontend/src/pages/inventory/manage/ItemCatalogTable.tsx` | 52–57, 180–181 | Display + sort |
| Label print | `frontend/src/pages/inventory/processing/printProcessingLabel.ts` | 4, 11–12 | `product_title` / `product_brand` from Item |
| Label print | `frontend/src/services/localPrintService.ts` | 26–27, 204, 222–223 | Print request fields |

**Mitigation:** processing workspace already uses `product_title`/`product_brand`; `printed_items_preview` prefers Product ([processing_workspace.py](../../apps/inventory/services/processing_workspace.py) ~1304). Derive-from-Product is viable after backfill + serializer virtual fields.

#### default_price write hub + Item price old path

| Area | File | Lines | Usage |
|------|------|-------|-------|
| Manifest build | `apps/inventory/views.py` | 1084, 1204, 1237–1242, 1300–1309, 1490 | Create/sync products; old item price path |
| Manual item resolver | `apps/inventory/services/manual_item.py` | 158–189, 204–289 | Create/update product with default_price |
| Processing check-in | `apps/inventory/processing_ops.py` | 321, 347, 381, 460, 767, 960, 1031, 1193, 1818–1821 | Passes `default_price` into product resolver; rewrite to row/Item price only |
| Transforms | `apps/inventory/services/processing_transforms.py` | 175 | Product resolution |
| Item serializer | `apps/inventory/serializers.py` | 887, 908 | Routes item price to product default_price |
| Match snapshots | `apps/inventory/services/product_matching.py` | 42 | `product_snapshot()` includes default_price |
| Frontend | `frontend/src/pages/inventory/manage/ProductCatalogTable.tsx` | 55–56, 198, 271–274 | Price column display/sort |

**Required rewrite:** delete the Product price column and all writes/reads. Item creation must require a row/check-in price (`ProcR.shelf_price` / `final_price` / explicit check-in price); Product never participates in price resolution.

#### Product.upc as primary dedup key

| Area | File | Lines | Usage |
|------|------|-------|-------|
| Manifest product find | `apps/inventory/views.py` | 1043–1085, 1292–1309, 1456, 6272 | Lookup by `upc`; search_fields |
| Manual item | `apps/inventory/services/manual_item.py` | 135–137, 254–270 | UPC-first dedup |
| Product matching | `apps/inventory/services/product_matching.py` | 41, 113–115 | Score-100 UPC match |
| Workspace identity | `apps/inventory/services/processing_workspace.py` | 201, 592, 615 | Product UPC takes precedence today |
| Processing search string | `apps/inventory/services/processing_search_string.py` | 103–107 | Current ProcessingRow search augments with product.upc; Product search target does not require Product.search_string |
| Item search | `apps/inventory/models.py` | 1223 | `rebuild_search_text` includes product.upc |
| ItemViewSet search | `apps/inventory/views.py` | 6607 | `product__upc` in search_fields |
| Frontend | `frontend/src/components/inventory/ItemForm.tsx` | 731–733, 1194–1197 | UPC form field |
| Frontend tables | `frontend/src/pages/inventory/manage/ProductCatalogTable.tsx`, `ItemCatalogTable.tsx` | — | UPC columns |

**Required rewrite:** migrate values into `identifiers['upc']`, rewrite lookups to JSON, then remove the flat column. During the migration window, code should be moved to the new field rather than adding new old-field reads.

#### Item.unit_count / ProcessingRow.units_per_item removal

| Area | File | Lines | Usage |
|------|------|-------|-------|
| Model fields | `apps/inventory/models.py` | 701–706, 1094–1099 | `ProcessingRow.units_per_item` stamps `Item.unit_count` |
| Check-in write | `apps/inventory/processing_ops.py` | 475, 1279 | Writes `unit_count=max(1, row.units_per_item)` |
| Transform service | `apps/inventory/services/processing_transforms.py` | 203–219, 299–391 | Break apart / make set maintains `units_per_item` |
| Workspace API | `apps/inventory/services/processing_workspace.py` | 161, 476, 698, 1564 | Serializes `unit_count` / `unitsPerItem` |
| Serializer | `apps/inventory/serializers.py` | 842 | Exposes `unit_count` |
| Frontend type | `frontend/src/types/inventory.types.ts` | 442 | `unit_count?: number` |
| Tests | `apps/inventory/tests/test_processing_transforms.py` | 103–192, 335 | Transform assertions include `unit_count` stamps |

**Required rewrite:** remove bulk/set accounting for now. Every `Item` represents exactly 1 unit; transform flows cannot create multi-unit Items. Any quantity reshaping must result in one Item per sellable unit or be removed from v1.

### MEDIUM

| Risk | Files | Mitigation |
|------|-------|------------|
| Product search implementation | Current plan had Product `search_string`; owner direction now prefers indexed multi-field/JSON/tag search first | Add indexes and query across fields; only add denormalized string if profiling requires it |
| Serializer/API contract | `serializers.py` ~749 (`fields = '__all__'`); `ItemSerializer.product_upc` | Explicit field lists; virtual read fields |
| Match snapshot compatibility | `product_matching.py` ~41–42; `PreprocessingMatchCell.tsx` ~221 | Snapshot shape must be rewritten deliberately with migration notes |
| Frontend type/API drift | `inventory.types.ts`; Manage tables; `ItemForm` | Update types + forms in switch-reads phase |
| `Item.product` NOT NULL backfill | Old imports, historical sold | Reuse exact Product by identifiers/identity; create rough Products from Item data; attach Generic Product when not meaningful |

### LOW (nearly UI-dead)

| Field | Writers | Readers | Notes |
|-------|---------|---------|-------|
| `times_ordered` | `views.py` ~1220–1242 | `processing_workspace.py` ~202, ProductSerializer | Recompute-only |
| `total_units_received` | `views.py` ~1226–1242 | `processing_workspace.py` ~203, ProductSerializer | Recompute-only |
| `processing_tier` | `views.py` ~1127, 1471, 5657; `processing_finalize.py` ~514 | `serializers.py` ~840, admin | Old batch queue only |
| `batch_group` | `views.py` ~1498, 5656, 6518 | `BatchGroupViewSet` ~6290–6545 | Modern workspace uses ProcR collapse |

### Cross-DB / one-time commands (must not crash on column drop)

- `import_legacy_data.py` — writes `upc`, `default_price`, `title`, `brand`
- `backfill_phase2_products_manifests.py` — writes `upc`, `default_price`
- `backfill_phase3_items.py` — writes `title`, `brand`; reads `product.upc`
- `backfill_phase5_categories.py` — reads `product.upc` for export

---

## 3. Product identifiers + search/tags migration sub-plan

### 3.1 Add `Product.identifiers` (JSONField)

1. Migration: add `identifiers JSONField default=dict`.
2. Data migration: copy existing `upc` values into `identifiers['upc']`.
3. Rewrite reads/writes: dedup (`manual_item.py`, `views.py` `_find_or_create_manifest_product`), matching (`product_matching.py`), search augmentation (`processing_search_string.py`), `Item.rebuild_search_text`.
4. Update `ItemSerializer.product_upc` → read from `product.identifiers['upc']`.
5. Drop `Product.upc` column once rewritten callers and tests pass.

### 3.2 Product search without mandatory `search_string`

1. Add Product `tags` (JSON/list) if approved in schema pass; AI suggest may propose tags.
2. Product search query stays token-AND, but each token can match indexed Product fields:
   - `product_number`
   - `title`, `brand`, `model`, `category`
   - `identifiers` JSON values
   - `tags`
3. Use DB indexes/GIN indexes where practical. Do **not** add pre-concatenated `Product.search_string` unless performance testing proves multi-field search is too slow.
4. Frontend: no change to search bar UX; API param stays `search`.

### 3.3 ProcessingRow search augmentation

- Today: `augment_processing_row_search_string()` appends `product.upc` ([processing_search_string.py](../../apps/inventory/services/processing_search_string.py) ~103).
- After: append Product identifiers/tags/category/title fields directly as needed. Do not depend on a Product `search_string`.

---

## 4. Phasing (recommended)

| Phase | Actions | Exit criteria |
|-------|---------|---------------|
| **0 — Design freeze** | Owner signs section 1 owner decisions | Decision log updated |
| **1 — Add new sources** | `Product.identifiers` + optional `Product.tags`; migrate UPC values; add indexes | Migrations run; search works on new fields |
| **2 — Rewrite callers** | Dedup, matching, serializers, frontend tables/forms; Item title/brand virtual from Product | Tests green; no old-field reads in app code |
| **3 — Remove old writes/columns** | Remove Item.title/brand, Item.unit_count, retired stats, and every `default_price` path | No retired Product/Item fields in app code |
| **4 — Constraints** | Backfill Item.product; NOT NULL/PROTECT; Product title/brand constraints; rename `Item.unit_retail` to `retail` | Migration applies cleanly |
| **5 — Drop old fields** | Drop columns: Product description/string category/category_ref/upc, Item title/brand/category/unit_count, processing_tier, batch_group, stats columns, ManifestRow/PreprocessingRow/ProcessingRow description fields | No reader references remain |

---

## 5. Test inventory + verification per phase

### Backend tests (update when touching field)

| Test file | What it covers |
|-----------|----------------|
| `test_product_matching.py` | UPC match, `matched_product_detail`, price snapshot removal |
| `test_item_serializer.py` | Item create/update, `product.upc` |
| `test_processing_identity.py` | Product UPC wins over row identifiers |
| `test_item_create_unified.py` | Product dedup on create |
| `test_ai_cleanup_batch.py` | AI cleanup fixtures with UPC |
| `test_processing_validation_matrix.py` | `product__upc` filters |
| `test_preprocessing_redesign.py` | Finalize item title assertions |
| `test_processing_transforms.py` | CartLine from item.title; unit_count / units_per_item removal |

### Frontend tests

| Test file | What it covers |
|-----------|----------------|
| `processingWorkspaceFilters.test.ts` | Product UPC overrides identifier UPC |
| `checkedInHistory.test.ts` | Workspace product DTO fixtures |

### Verification per phase

| Phase | Commands / checks |
|-------|-------------------|
| 1 | Product search API token-AND manual test across title/brand/model/category/identifiers/tags |
| 2 | `pytest apps/inventory/tests/test_item_serializer.py test_processing_identity.py`; `npm run test` frontend |
| 3 | Grep for writes to retired fields = 0 in app code (exclude migrations) |
| 4 | `SELECT COUNT(*) FROM item WHERE product_id IS NULL` = 0 before migration |
| 5 | Full `pytest apps/inventory/tests/` + frontend test suite |

---

## 6. Decision log

| Date | Decision | Status | Notes |
|------|----------|--------|-------|
| 2026-06-13 | Hard removal of retired fields | **Owner decision** | No compatibility crutches or old-field shadow reads |
| 2026-06-13 | `default_price` fully removed | **Owner decision** | Product has no price source |
| 2026-06-13 | Single-source: Product identity mandatory, Item.product NOT NULL | **Owner decision** | Product cannot be deleted while Items exist |
| 2026-06-13 | Null-product Item backfill | **Owner decision** | Reuse exact Products by identifier/identity; create rough Products from Item data; use Generic Product when not meaningful |
| 2026-06-13 | POS Product reads | **Owner guidance** | Use joined queries such as `select_related('product')` where POS needs Product fields |
| 2026-06-13 | Title lineage: Template Formula creates `ManifestRow.title` | **Owner decision** | Remove `ManifestRow.description` from canonical design |
| 2026-06-13 | `Item.unit_retail` renamed to `Item.retail` | **Owner decision** | Retail/MSRP separate from price |
| 2026-06-13 | `Item.unit_count` removed | **Owner decision** | Every Item represents exactly 1 unit |
| 2026-06-13 | Brand only on Product/staging/ManifestRows | **Owner decision** | No `Item.brand` |
| 2026-06-13 | Category lineage corrected | **Owner decision** | `MR.taxonomy` stores source category fields; `PR.ai_category` and later fields are canonical |
| 2026-06-14 | Category source reset | **Owner decision** | Categories have one purpose: Product categories. Runtime source is `inventory.Category`, seeded to the 19 prior taxonomy v1 names. Product has `category` FK only. |
| 2026-06-14 | Product description removed | **Owner decision** | Remove `Product.description` and Product/manifest/preprocessing/processing description lineage with no legacy compromise. |
| 2026-06-13 | Identifier source JSON | **Owner direction** | Manifest ID/tracking-like source fields go to `MR.identifiers`; not AI-adjusted in preprocessing/processing; Product identifiers can be prefilled on Product creation |
| 2026-06-13 | Product search implementation | **Owner direction** | Prefer indexed field/JSON/tag search; no Product `search_string` unless profiling proves it necessary |
| 2026-06-13 | Preprocessing layer model | **Owner decision** | `ManifestRow` is standardized; `PreprocessingRow` has `ai_*` and `final_*` only |
| 2026-06-13 | Location lineage | **Owner decision** | `Item.location` is internal inventory location from dispatch/check-in, not ingest lineage |
| 2026-06-13 | Condition constraints | **Owner decision** | Standard condition set applies from `ai_condition` through `Item.condition` |

---

## See also

- Initiative: [product_item_crud_and_processing](../initiatives/product_item_crud_and_processing.md)
- Field matrix: [item_product_creation_fields.md](./item_product_creation_fields.md)
- Layer helpers: [layer_helpers.py](../../apps/inventory/layer_helpers.py)
- Manifest standard fields: [manifest_standard_fields.py](../../apps/inventory/manifest_standard_fields.py)
- Models: [models.py](../../apps/inventory/models.py) (`Product` ~861, `Item` ~1063, `ProcessingRow` ~622)

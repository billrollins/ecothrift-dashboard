# 00 — Frozen Decisions

**Purpose:** owner decisions that implementation must obey. If any line here changes, update every dependent plan file before coding.

## Cleanup Policy

- Retired fields are removed from the canonical design.
- Existing callers must be rewritten to the new source of truth.
- No reading retired fields to preserve old behavior.
- No field that exists only to preserve the old model shape.
- No `Product.default_price` or any Product price source.

## Product Decisions

| Topic | Decision |
|-------|----------|
| Product identity | Product owns `title`, `brand`, `model`, canonical `category`, `description`, `specifications`, `identifiers`, `tags`, and `is_active`. |
| Product price | Product owns no price. Shelf/tag price is row/check-in/Item only. |
| `default_price` | Remove fully from model, serializers, services, tests, and frontend. |
| `upc` | Move from flat `Product.upc` to `Product.identifiers['upc']`. Drop flat column after callers move. |
| `times_ordered` | Stop surfacing; recompute/report only if needed. Drop candidate. |
| `total_units_received` | Stop surfacing; recompute/report only if needed. Drop candidate. |
| `product_number` | Keep as human-readable Product system ID. |
| `description` | Manual/catalog detail only. It is not sourced from manifest description. |
| `tags` | Product-owned search aid. AI may suggest tags. |
| Product search | Use indexed Product fields, identifiers JSON values, and tags. Do not add `Product.search_string` unless profiling proves it necessary. |
| Product delete | `Item.product` uses `PROTECT`; Product cannot be deleted while Items exist. Product merge/reassign is required before delete. |

## Item Decisions

| Topic | Decision |
|-------|----------|
| Item identity | Item does not own Product identity fields. Item reads Product title/brand/model/category through `Item.product`. |
| `Item.product` | Required. Target: `NOT NULL` FK with `on_delete=PROTECT`. |
| `Item.title` | Drop column. Serializer/UI read Product title. |
| `Item.brand` | Drop column. Serializer/UI read Product brand. |
| `Item.unit_retail` | Rename target Item endpoint to `Item.retail`. Upstream field remains `unit_retail` while quantity exists. |
| `Item.price` | Shelf/tag price. Separate from `retail`. Set from `ProcessingRow.shelf_price` / final price path / explicit check-in price. |
| `Item.unit_count` | Remove. Every Item represents exactly one physical unit. |
| `Item.sku` | Keep as human-readable Item system ID. |
| `processing_tier` | Remove old batch artifact from Item. |
| `batch_group` | Remove old batch artifact from Item. Collapse lives on `ProcessingRow`. |
| `location` | Internal inventory location set from dispatch/check-in/update. Not ingest lineage. |
| `condition` | Must use the standard condition set from `PreprocessingRow.ai_condition` through `Item.condition`. |
| `cost` | Defer as computed/view later. Current migration should not make Product own cost or price. |

## Manifest / Preprocessing / Processing Decisions

| Topic | Decision |
|-------|----------|
| Standardized layer | `ManifestRow` is the standardized row. |
| Preprocessing layers | `PreprocessingRow` has only `ai_*` and `final_*` layers. |
| Processing fields | `ProcessingRow` has plain field names used by processing/check-in. |
| Title | Template Formula creates `ManifestRow.title`; remove canonical `ManifestRow.description`. |
| Category source | Source category-like columns map into `ManifestRow.taxonomy` JSON. |
| Canonical category | `PreprocessingRow.ai_category`, `final_category`, `ProcessingRow.category`, and `Product.category` must be canonical EcoThrift categories. |
| Identifiers | Source ID/tracking-like columns map into `ManifestRow.identifiers` JSON. |
| Tracking bucket | No separate `ManifestRow.tracking` target. Tracking-like source fields are absorbed into `identifiers`. |
| Quantity | `Raw.quantity > ManifestRow.quantity > PreprocessingRow.quantity > ProcessingRow.quantity`; Item has no quantity field. |
| Retail | `Raw.unit_retail > ManifestRow.unit_retail > PreprocessingRow.unit_retail > ProcessingRow.unit_retail > Item.retail`. |

## Backfill Decisions

- Existing `Item` rows with `product_id IS NULL` must be attached to a Product before constraints.
- Reuse exact Product matches by identifiers first, then normalized `title + brand + model + category`.
- Create rough Products from meaningful Item identity when no exact Product exists.
- Attach meaningless identity rows to a pre-created Generic Product.
- Generic Product is `title = Generic Product`, `brand = Generic`, `category = Mixed lots & uncategorized`, `is_active = true`.
- Invalid condition values map to `unknown` before constraints.
- Missing historical data is resolved with approved Generic/default values and logged; implementation does not stop for unbackfillable dirty data.
- If check-in can create Items without Product, fix that implementation path immediately and add a regression test.
- Never copy Item price or Item retail into Product during backfill.

## Approval Status

Approved by owner on 2026-06-13. Coding is ready under these decisions. Do not create pull requests or push to GitHub from this plan.

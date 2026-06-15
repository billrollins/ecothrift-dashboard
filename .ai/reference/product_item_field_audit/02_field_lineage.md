# 02 — Field Lineage

**Purpose:** define exactly where each value comes from and where it is consumed.

## Canonical Pattern

Most fields should follow:

`Raw CSV/template formula > ManifestRow.field > PreprocessingRow.ai_field > PreprocessingRow.final_field > ProcessingRow.field > Product.field OR Item.field`

Important layer rule:

- `ManifestRow` is the standardized row.
- `PreprocessingRow` has `ai_*` and `final_*` layers only.
- `ProcessingRow` has plain field names.

## Identity To Product

| Field | Current | Target |
|-------|---------|--------|
| `title` | `Raw.description` or `Raw.title > ManifestRow.description` / `ManifestRow.title > PreprocessingRow.ai_title > final_title > ProcessingRow.title > Product.title > Item.title` | `Raw.title > ManifestRow.title > PreprocessingRow.ai_title > final_title > ProcessingRow.title > Product.title`; Item reads Product. Drop `Item.title`. |
| `brand` | `Raw.brand > ManifestRow.brand > PreprocessingRow.ai_brand > final_brand > ProcessingRow.brand > Product.brand > Item.brand` | `Raw.brand > ManifestRow.brand > PreprocessingRow.ai_brand > final_brand > ProcessingRow.brand > Product.brand`; drop `Item.brand`. |
| `model` | `Raw.model > ManifestRow.model > PreprocessingRow.ai_model > final_model > ProcessingRow.model > Product.model` | Same. |
| `description` | Current code has Product, manifest, preprocessing, and processing description concepts. | Remove the entire Product/manifest/preprocessing/processing description lineage. Product has no description. Use `title`, `notes`, `specifications`, `identifiers`, or `tags`. |

## Taxonomy / Category

| Field | Current | Target |
|-------|---------|--------|
| source category fields | Raw columns vary by vendor: `department`, `gl_category`, `seller_category`, `category`, etc. | All source category-like columns map into `ManifestRow.taxonomy` JSON. If a vendor has a raw `taxonomy` column, store it as `ManifestRow.taxonomy['taxonomy']`. |
| canonical category | Some flat category values and `Product.category_ref` exist at multiple stages. | `ManifestRow.taxonomy` informs `PreprocessingRow.ai_category`, which resolves to one of the 19 `inventory.Category` rows. Then `final_category > ProcessingRow.category > Product.category` remain canonical Category references. |

Target lineage:

`Raw source category columns > ManifestRow.taxonomy(JSON source fields) > PreprocessingRow.ai_category(canonical Category) > PreprocessingRow.final_category(canonical Category) > ProcessingRow.category(canonical Category) > Product.category(canonical Category FK)`

Implementation decision is now fixed: runtime canonical categories come from `inventory.Category`, seeded to the 19 prior `TAXONOMY_V1_CATEGORY_NAMES`. Product `category` is a FK. The old Product string category and `category_ref` are removed.

## Identifiers / Tracking

| Field | Current | Target |
|-------|---------|--------|
| identifiers | Split across flat fields, buckets, Product `upc`, and row/product matching code. | Source ID-like fields map into `ManifestRow.identifiers`. Product owns final Product identifiers in `Product.identifiers`. |
| tracking-like fields | Some source fields may be treated separately or mixed with location. | Absorb source tracking-like fields into `ManifestRow.identifiers`. No separate `ManifestRow.tracking` target. |
| Product UPC | Flat `Product.upc` drives dedup/search/matching. | `Product.identifiers['upc']`. Drop flat `upc` after callers move. |

Target lineage:

`Raw UPC/ASIN/item number/SKU/lot/pallet/LPN/etc. > ManifestRow.identifiers(JSON source fields) > Product.identifiers(JSON prefill/manual edit when relevant)`

Rules:

- Do not AI-adjust identifiers in preprocessing/processing.
- Do not put internal `Item.location` in this lineage.
- Product creation/check-in may prefill `Product.identifiers` from row source identifiers when relevant.
- **`Item.check_in`** → **`ItemCheckIn`** is the canonical check-in event link (0063). Legacy **`ItemCheckIn.item_ids`** JSON remains during dual-write soak.

## Pricing

Pricing has separate tracks. Do not merge them.

| Field | Current | Target |
|-------|---------|--------|
| retail | `Raw.unit_retail > ManifestRow.unit_retail > PreprocessingRow.unit_retail > ProcessingRow.unit_retail > Item.unit_retail` | `Raw.unit_retail > ManifestRow.unit_retail > PreprocessingRow.unit_retail > ProcessingRow.unit_retail > Item.retail` |
| proposed price | AI/proposed pricing context. | Keep if used by review flow; not Product price. |
| final price | `PreprocessingRow.final_price` can feed row shelf price. | `PreprocessingRow.final_price > ProcessingRow.shelf_price > Item.price` |
| shelf price | `ProcessingRow.shelf_price > Item.price` | Same. |
| Product default price | Product participates in old price paths. | Remove entirely. |
| cost | Computed from retail today. | Defer to computed/view later. Do not make Product own cost. |

Target retail lineage:

`Raw.unit_retail > ManifestRow.unit_retail > PreprocessingRow.unit_retail > ProcessingRow.unit_retail > Item.retail`

Target shelf/tag price lineage:

`PreprocessingRow.final_price > ProcessingRow.shelf_price > Item.price`

Check-in rule:

- Processor can edit `ProcessingRow.unit_retail`; that value pre-fills `Item.retail`.
- Processor can edit shelf/check-in price; that value becomes `Item.price`.
- `Item.retail` and `Item.price` are different values.

## Quantity / Units

| Field | Current | Target |
|-------|---------|--------|
| `quantity` | `Raw.quantity > ManifestRow.quantity > PreprocessingRow.quantity > ProcessingRow.quantity > item loop count` | Same, but Item has no quantity field. |
| `unit_count` | `ProcessingRow.units_per_item > Item.unit_count` | Remove. Every Item represents exactly one physical unit. |

Target quantity lineage:

`Raw.quantity > ManifestRow.quantity > PreprocessingRow.quantity > ProcessingRow.quantity > check-in creates N single-unit Items`

No v1 flow creates one Item that represents multiple physical units.

## Location

| Field | Current | Target |
|-------|---------|--------|
| source location/tracking fields | May be read as source identity/tracking values. | If source field is tracking-like, put it in `ManifestRow.identifiers`. |
| `Item.location` | Item inventory location. | Internal location set from dispatch/check-in/update. No ingest lineage. |

Target:

`dispatch/check-in/update > Item.location`

## Condition

| Field | Current | Target |
|-------|---------|--------|
| condition | `Raw.condition > ManifestRow.condition > PreprocessingRow.ai_condition > final_condition > ProcessingRow.condition > Item.condition` | Same lineage, but values from `ai_condition` onward must use the standard condition set. |

Target:

`Raw.condition > ManifestRow.condition > PreprocessingRow.ai_condition(standard) > PreprocessingRow.final_condition(standard) > ProcessingRow.condition(standard) > Item.condition(standard)`

## Notes / Specifications

| Field | Current | Target |
|-------|---------|--------|
| notes | `Raw.notes > ManifestRow.notes > PreprocessingRow.ai_notes > final_notes > ProcessingRow.notes > Item.notes` | Same. |
| specifications | `Raw specs > ManifestRow.specifications > PreprocessingRow.ai_specifications > final_specifications > ProcessingRow.specifications > Product.specifications + Item.specifications` | Same target, with ownership clarified by field purpose. |

## Generated System IDs

| Field | Target |
|-------|--------|
| `Product.product_number` | Generated human-readable Product system ID. |
| `Item.sku` | Generated human-readable Item system ID. |

These are operational identifiers, not raw vendor IDs.

## Retired Stats / Batch Fields

| Field | Target |
|-------|--------|
| `Product.times_ordered` | Remove as canonical field; recompute/report if needed. |
| `Product.total_units_received` | Remove as canonical field; recompute/report if needed. |
| `Item.processing_tier` | Remove. |
| `Item.batch_group` | Remove. |

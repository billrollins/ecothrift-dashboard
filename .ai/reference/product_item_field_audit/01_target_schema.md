# 01 — Target Schema

**Purpose:** exact field ownership for the cleanup. This is the schema target, not the migration sequence.

## Product

### Keep

| Field | Target notes |
|-------|--------------|
| `product_number` | Stable, human-readable Product system ID. Unique. |
| `title` | Canonical Product title. Required, non-empty. |
| `brand` | Canonical Product brand. Required, default `Generic` when unknown. |
| `model` | Canonical Product model. Blank allowed. |
| `category` | Required FK to `inventory.Category`. The table is seeded to the 19 canonical categories from the prior `TAXONOMY_V1_CATEGORY_NAMES`. |
| `specifications` | Product-level JSON specs. |
| `tags` | Product-owned search aid; JSON/list. AI can suggest. |
| `is_active` | Product catalog visibility flag. |

### Add

| Field | Type | Target notes |
|-------|------|--------------|
| `identifiers` | `JSONField(default=dict)` | UPC, ASIN, item number, SKU, MPN, EAN, GTIN, and other Product-relevant source IDs. Existing `upc` migrates to `identifiers['upc']`. |

### Retire

| Field | Replacement |
|-------|-------------|
| `upc` | `identifiers['upc']` |
| old string `category` | `category` FK to `inventory.Category` after deterministic mapping to the 19 canonical rows. |
| `category_ref` | `category` FK to `inventory.Category`. Do not preserve the legacy name. |
| `description` | None. Product description is removed everywhere. Use `title`, `notes`, `specifications`, `identifiers`, or `tags` as appropriate. |
| `default_price` | None. Product has no price source. |
| `times_ordered` | Recompute/report if needed. No canonical Product column. |
| `total_units_received` | Recompute/report if needed. No canonical Product column. |

### Constraints

- `title` is `NOT NULL` and non-empty.
- `brand` is `NOT NULL`; unknown brand is `Generic`.
- `category_id` is `NOT NULL` and points to one of the 19 canonical `inventory.Category` rows.
- `product_number` remains unique.
- Product delete is blocked by `Item.product PROTECT` while Items exist.

## Item

### Keep

| Field | Target notes |
|-------|--------------|
| `sku` | Stable, human-readable Item system ID. Unique. |
| `product` | Required FK to Product. `on_delete=PROTECT`. |
| `purchase_order` | Purchase linkage. |
| `manifest_row` | Manifest source row linkage. |
| `price` | Shelf/tag price. Not Product price. |
| `retail` | Item retail/MSRP. Renamed from `unit_retail`. |
| `status` | Item lifecycle. |
| `condition` | Standard condition set. |
| `location` | Internal inventory location. |
| `specifications` | Item-level JSON specs/snapshot. |
| `listed_at` | Listing/check-in lifecycle timestamp. |
| `checked_in_at` / `checked_in_by` | Check-in audit fields. |
| `sold_at` / `sold_for` | Sale lifecycle fields. |
| `notes` | Item notes. |
| `dispute_type`, `dispute_pct_loss`, `dispute_description` | Dispute fields. |

### Retire

| Field | Replacement |
|-------|-------------|
| `title` | `item.product.title` through serializer/API virtual read field if needed. |
| `brand` | `item.product.brand` through serializer/API virtual read field if needed. |
| `category` | `item.product.category` through serializer/API virtual read field if needed. |
| `unit_retail` | Rename to `retail`. |
| `unit_count` | None. Every Item is one physical unit. |
| `processing_tier` | None. Old batch artifact. |
| `batch_group` | None. Old batch artifact. |

### Constraints

- `product_id` is `NOT NULL`.
- `product` uses `on_delete=PROTECT`.
- `price` is required at Item creation/check-in.
- `condition` must be a valid standard condition.
- `location` is not populated from Manifest source fields.

## ManifestRow

### Target Standardized Fields

| Field | Target notes |
|-------|--------------|
| `title` | Created by Template Formula. Replaces canonical manifest description usage. |
| `brand` | Standardized source brand. |
| `model` | Standardized source model. |
| `quantity` | Source quantity for row/check-in loop. |
| `unit_retail` | Source unit retail/MSRP. |
| `condition` | Source condition before AI maps/cleans to standard set. |
| `notes` | Source notes. |
| `specifications` | Source/open specs JSON. |
| `taxonomy` | Source category-like fields: `department`, `gl_category`, `seller_category`, `category`, `taxonomy`, etc. |
| `identifiers` | Source ID/tracking-like fields: UPC, ASIN, item number, SKU, lot, pallet, LPN, etc. |

### Retire / Avoid

| Field | Target |
|-------|--------|
| canonical `description` lineage | Use `title` for identity and `notes` for notes. Product description does not exist. |
| separate `tracking` bucket | Use `identifiers` for tracking-like source fields. |

## PreprocessingRow

### Target Layers

| Layer | Notes |
|-------|-------|
| `ai_*` | AI cleanup output. For category/condition, output must be canonical/standard. |
| `final_*` | Staff-reviewed final output. |
| non-layer source fields | `quantity` and `unit_retail` remain source/read-through style fields where AI cleanup is skipped. |

### Required Canonical Fields

- `ai_title` / `final_title`
- `ai_brand` / `final_brand`
- `ai_model` / `final_model`
- `ai_category` / `final_category` as canonical `inventory.Category` references or immediately resolved canonical category IDs.
- `ai_condition` / `final_condition`
- `ai_notes` / `final_notes`
- `ai_specifications` / `final_specifications`

### Retire Current Non-Target Layers

Current code still has source-copy fields on `PreprocessingRow`. Target removes them because `ManifestRow` is the standardized source row:

- `standard_description`
- `standard_brand`
- `standard_model`
- `standard_condition`
- `standard_notes`
- `standard_identifiers`
- `standard_taxonomy`
- `standard_specifications`
- `standard_tracking`
- `standard_search_tags`

Target also removes identifier/tracking/taxonomy AI/final adjustment fields where they only duplicate source buckets:

- `ai_identifiers` / `final_identifiers`
- `ai_taxonomy` / `final_taxonomy`
- `ai_tracking` / `final_tracking`
- `ai_search_tags` / `final_search_tags` unless replaced by Product-owned tags during Product creation

## ProcessingRow

### Target Fields

| Field | Target notes |
|-------|--------------|
| `title`, `brand`, `model`, `category` | Processing fields from final preprocessing values. `category` resolves to the canonical `inventory.Category` row used by Product creation/matching. |
| `condition` | Plain processing condition; standard set. |
| `quantity` | Row quantity; controls number of Items checked in. |
| `unit_retail` | Row retail/MSRP; pre-fills `Item.retail`. |
| `proposed_price` | AI/proposed pricing context. Drop only if implementation audit proves unused. |
| `final_price` | Final preprocessing price. |
| `shelf_price` | Processor shelf/tag price; feeds `Item.price`. |
| `notes` | Row notes; can feed Item notes. |
| `specifications` | Row specs; can feed Product/Item specs. |
| `matched_product` | Product match/selection source for check-in. |

### Retire

| Field | Replacement |
|-------|-------------|
| `units_per_item` | None in v1. Quantity becomes one Item per unit. |
| `description` | None. Use `title`, `notes`, and `specifications`. |

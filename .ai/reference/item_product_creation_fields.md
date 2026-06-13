# Item / product creation fields — cross-surface matrix

Fields that affect **Product** and **Item** identity, pricing, or intake defaults across preprocessing, processing, Add Item, and Detailed check-in.

**Last reviewed:** 2026-06-13 (code: `ManifestRow`, `PreprocessingRow`, `ProcessingRow`, `Product`, `Item`, `ItemSerializer`, processing UI, `ItemForm`). **Schema cleanup planning pack:** [product_item_field_audit/](./product_item_field_audit/README.md).

---

## Legend

| Column | Meaning |
|--------|---------|
| **Table** | Primary Django model / JSON bucket |
| **Field** | API / UI name (snake_case unless noted) |
| **Format** | Type / constraints |
| **Preproc** | Preprocessing concern |
| **Proc defaults** | Processing workspace → *Processing row defaults* |
| **Proc quick** | Processing workspace → *Quick check-in* |
| **Add Item** | Search Items → Add Item modal (`ItemForm` create) |
| **Detailed check-in** | Processing → *Detailed check-in* dialog |

**Preproc codes**

| Code | Meaning |
|------|---------|
| **Map** | Step 1 — column mapping / standardize formulas (`manifest_standard_fields`) |
| **AI** | AI cleanup pass — writes `ai_*` layers on `PreprocessingRow` |
| **Review** | Step 3 — Final Review grid editable (`PreprocessingReviewRowPatch`) |
| **Layer** | Stored on `PreprocessingRow` (standard / ai / final) but not in Review patch |
| **Finalize** | Copied to `ManifestRow` / `ProcessingRow` on finalize |
| **—** | Not applicable at this stage |

**Proc / UI codes**

| Code | Meaning |
|------|---------|
| **Edit** | User can change before/during check-in |
| **Read** | Shown but not edited here |
| **Seed** | Pre-filled from row/product defaults |
| **Create** | Set when Item/Product is created |
| **Auto** | System-generated |
| **—** | Not surfaced |

---

## Row identity & quantity

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| `PreprocessingRow` / `ManifestRow` / `ProcessingRow` | `row_number` | int ≥ 1 | Map (implicit) | Read | — | — | Read | Display only (“Row N”) |
| `PreprocessingRow` / `ManifestRow` / `ProcessingRow` | `quantity` | int ≥ 1 | Map | Read | — | — | **Edit** (`quantity`) | Expected units per manifest line; check-in creates up to 500 per action |
| `ProcessingRow` | `row_kind` | `manifest` \| `added` | — | Read | — | — | — | `added` = PO line without manifest |
| `ProcessingRow` | `qty` / `qtyDispositioned` / `qtyRemaining` | int | Finalize (derived) | Read | Read (“Left after”) | — | Read | Rollups, not creation inputs |

---

## Product catalog (shared identity)

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| `Product` | `product_number` | `PRD-#####` | — | Read (if matched) | — | Auto (on create) | Read (search) | Human-readable Product system ID; assigned on first product save |
| `Product` | `title` | string ≤ 300 | Map (`title` target), AI → Review | **Edit** | — | **Edit** (required) | **Edit** (`title` / `pTitle`) | Canonical identity; Item reads Product title |
| `Product` | `brand` | string ≤ 200 | Map, AI → Review | **Edit** | — | **Edit** (default “Generic”) | **Edit** | |
| `Product` | `model` | string ≤ 200 | Map, AI → Review | **Edit** | — | **Edit** | **Edit** | Lives on `Product`; exposed on Item via `product_model` |
| `Product` | `category` | canonical EcoThrift category | AI → Review from `ManifestRow.taxonomy` | **Edit** | — | **Edit** (required) | **Edit** | Raw source columns map into `ManifestRow.taxonomy`; `ai_category` through Product.category are canonical |
| `Product` | `identifiers` | JSON object | Source from `ManifestRow.identifiers` | Read/prefill | — | **Edit** | **Edit** | Product-owned identifiers (UPC, ASIN, item number, SKU, etc.); no flat `upc` column in target |
| `Product` | `tags` | string[] / JSON list | AI/manual suggested | Read/prefill | — | **Edit** | **Edit** | Search aid; Product-owned. No required `Product.search_string` in target. |
| `Product` | `description` | text | — | — | — | — | — | Manual/catalog detail only; not sourced from ManifestRow in target design |
| `Product` | `specifications` | JSON object | Map (open bucket), Review (patch) | Layer (row `specifications`) | — | **Edit** (JSON text) | Seed (payload) | Detailed check-in sends `row.specs`; no dedicated editor in dialog |
| `Product` | `default_price` | decimal(10,2) | — | — | — | — | — | **Remove fully**; Product has no price source. Rewrite current writers to row/Item price only. |
| `Product` | `matched_product` / `product_id` | FK | AI match / Layer | Read | — | — | **Edit** (`product_mode`, `product_id`) | Modes: keep, edit, existing, new |

### Identifiers bucket (`identifiers.*`)

Stored as source JSON on ManifestRow; suggested keys from `manifest_standard_fields.IDENTIFIER_LOOKUP_ORDER`. Target also absorbs tracking-like source fields (`lot_id`, `pallet_id`, `lpn`, `location`, etc.) into this same bucket. Target does not AI-adjust these in preprocessing/processing; Product creation can prefill `Product.identifiers` from them when relevant.

| Sub-key | Format | Preproc | Proc defaults | Add Item | Detailed check-in |
|---------|--------|---------|---------------|----------|-------------------|
| `upc` | string | Map | Read/source | Product identifiers edit | Product identifiers edit |
| `asin` | string | Map | Read/source | Product identifiers edit | Product identifiers edit |
| `sku` / `item_number` / `mpn` / `ean` / `gtin` / `lot_id` / `pallet_id` / `lpn` | string | Map | Read/source | Product identifiers edit where relevant | Product identifiers edit where relevant |

### Taxonomy bucket (`taxonomy.*`)

| Sub-key | Format | Preproc | Proc defaults | Add Item | Detailed check-in |
|---------|--------|---------|---------------|----------|-------------------|
| `category`, `subcategory`, `department`, `gl_category`, `seller_category`, `taxonomy`, etc. | string | Map | Source material for AI category | — | — |

### Tracking-like source fields

Target: no separate `tracking` bucket. Map tracking-like source fields into `identifiers.*` (for example `identifiers.lot_id`, `identifiers.pallet_id`, `identifiers.lpn`) unless a future schema needs a split. `Item.location` is not ingest source data; it is internal inventory location set from dispatch/check-in.

---

## Search & notes

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| `Product` | `tags` | string[] (slugified) | AI/manual suggested | Read/prefill | — | **Edit** (tag chips) | — | Product-owned search aid; no required `Product.search_string` |
| `ProcessingRow` / `Item` | `notes` | text | Map, Review patch | **Edit** (Notes modal) | — | **Edit** | **Edit** | Row notes vs item notes at check-in |

---

## Condition & dispatch / location

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| Row / `Item` | `condition` | enum: new, like_new, very_good, good, fair, salvage, unknown | Map, AI → Review | Layer (row default) | **Edit** | **Edit** | **Edit** | Standard condition set is required from `ai_condition` through `Item.condition`; UI labels: “Used Good” → `good`, etc. |
| `ProcessingRow` | `list_dispatch` / `dispatch` | on_shelf, restoration, back_storage, online_sales, salvage | — | Layer | **Edit** | — | **Edit** | Salvage condition forces salvage dispatch |
| `Item` | `location` | string ≤ 100 | — | — | Create (from dispatch) | Form only† | Create (from dispatch) | Internal inventory location; not ingest pipeline data. †Shown in Add Item form but **not** sent on create POST; set on update |

---

## Pricing

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| Row / `Item` | Row: `unit_retail`; Item target: `retail` | decimal(10,2) | Map `unit_retail` (required), Review read | **Edit** (“Retail”) | — | **Edit** (`retail`) | **Edit** (`retail`) | Vendor unit retail/MSRP while quantity exists; only Item endpoint renames to `retail` |
| Row | `proposed_price` | decimal | AI, Review read | Layer | — | — | — | “Ideal” pricing in review |
| Row | `final_price` | decimal | Review **Edit** | Layer → `shelf_price` seed | — | — | — | Becomes processing shelf default |
| `ProcessingRow` | `shelf_price` / `price` | decimal | Finalize | **Edit** (“Price”) | **Edit** | **Edit** (`price`) | **Edit** (“Shelf price”) | Canonical processor shelf/tag price |
| `Item` | `price` | decimal | — | — | Create | **Edit** | Create | Copied to label print text |
| `Item` | `cost` | decimal | — | — | Auto (PO allocation) | Auto | Auto | From `PurchaseOrder.compute_item_cost(retail)` until cost becomes computed/view |
| Row | `pricing_stage` | unpriced \| draft \| final | Layer | — | — | — | — | Preproc pricing workflow |
| Row | `pricing_notes` | text | Review patch | — | — | — | — | |
| Row | `batch_flag` | bool | Review patch | — | — | — | — | Batch manifest line marker |

---

## Item intake & linkage (creation-time)

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| `Item` | `sku` | string unique | — | — | Auto | Auto | Auto | Human-readable Item system ID; generated on save |
| `Item` | `product` | FK | Finalize (match) | Read | Create | Create | Create | Via `find_or_create_product_for_manual_item` |
| `Item` | `purchase_order` | FK | — | Read | Create | **Edit** (if source=purchased) | Create | Required for PO processing path |
| `Item` | `manifest_row` | FK | Finalize | Read | Create | — | Create | Links item to manifest line |
| `Item` | `source` | purchased \| consignment \| misc | — | Create (`purchased`) | — | **Edit** | — | Consignment also creates consignment item row |
| `Item` | `status` | enum | — | — | Create (`on_shelf`) | Create (`intake` default API) | Create (`on_shelf`) | Add Item vs processing differ |
| `Item` | `processing_tier` | individual \| batch | — | — | Create | — | — | |
| `Item` | `specifications` | JSON | Layer | — | — | **Edit** | Create (from row/product) | Item-level copy at check-in |
| `Item` | `checked_in_at` / `checked_in_by` | datetime / FK | — | — | Create | — | Create | |
| `Item` | `listed_at` | datetime | — | — | Create | — | Create | Set at processing check-in |

---

## Preprocessing-only / matching (awareness, not intake forms)

| Table | Field | Format | Preproc | Proc | Add Item | Check-in | Notes |
|-------|-------|--------|---------|------|----------|----------|-------|
| `ManifestRow` | `match_status` | pending \| matched \| new | AI / Layer | Read | — | — | Product matching |
| `ManifestRow` | `match_candidates` | JSON[] | AI | — | — | — | |
| `ManifestRow` | `ai_match_decision` | enum | AI | — | — | — | |
| `ManifestRow` | `ai_reasoning` | text | AI | Read | — | — | |
| `PreprocessingRow` | `ai_status` | JSON | AI | — | — | — | clean / flagged / recovered |
| `PreprocessingRow` | `raw_row` | JSON | Map | — | — | — | Original CSV cells |
| Row layers | `ai_*`, `final_*` | per field | Layer | — | — | — | Target concept: ManifestRow is standardized; PreprocessingRow has AI and final only |

---

## Add Item modal — fields not in processing check-in

| Field | Format | Submit on create? | Notes |
|-------|--------|-------------------|-------|
| `source` | purchased \| consignment \| misc | Yes | Drives PO vs agreement picker |
| `purchase_order` | int FK | Yes (purchased) | Optional link |
| `agreement` | consignment API | Yes (consignment) | Separate consignment item record |
| `location` | string | **No** (update only) | UI present; omitted from create payload |
| AI suggest toggles | per-field | — | title, brand, category, condition, price, specifications, notes |

---

## Detailed check-in — payload summary

POST body keys used by `processing_row_check_in` (in addition to row context):

| Key | Maps to | Required |
|-----|---------|----------|
| `quantity` | loop count | Yes (default 1) |
| `product_mode` | keep \| edit \| existing \| new | Yes |
| `product_id` | existing product | If mode=existing |
| `title`, `brand`, `model`, `category`, `upc` | Product resolver | If mode≠keep |
| `condition` | Item.condition | Yes |
| `dispatch` | Item.location via mapping | Yes |
| `price` / `shelf_price` | Item.price | No (uses row/check-in shelf price path) |
| `retail` | Item.retail | No |
| `notes` | Item.notes | No |
| `specifications` | Item.specifications | No (defaults from row) |
| `tags` | Product.tags | No |

---

## Processing row defaults — UI ↔ API patch

| UI label | PATCH key | Backend field |
|----------|-----------|---------------|
| Title | `title` | `ProcessingRow.title` |
| Brand | `brand` | `ProcessingRow.brand` |
| Model | `model` | `ProcessingRow.model` |
| Category | `category` | `ProcessingRow.category` |
| Retail | `unit_retail` | `ProcessingRow.unit_retail` |
| Price | `shelf_price` | `ProcessingRow.shelf_price` |
| Identifiers | `identifiers` | `ManifestRow.identifiers` source; Product.identifiers target on Product creation |
| Tags | `tags` | `Product.tags` target |
| Notes | `notes` | `ProcessingRow.notes` |

Not in row-defaults toolbar today but patchable: `condition`, `proposed_price`, `final_price`. Target removes row/manifest description lineage.

---

## Preprocessing Final Review — editable columns

Grid columns → `PreprocessingReviewRowPatch` keys:

| Column | Patch key | Also stored as |
|--------|-----------|----------------|
| Title | `title` | `final_title` |
| Brand | `brand` | `final_brand` |
| Model | `model` | `final_model` |
| Category | `category` | `final_category` |
| Condition | `condition` | `final_condition` |
| Retail | — (read `unit_retail`) | |
| Price controls | `final_price`, `proposed_price`, `pricing_notes` | |
| Title | `title` | `final_title`; target Template Formula creates Title directly |
| Notes | `notes` | `final_notes` |
| Batch | `batch_flag` | |
| Tags / specs | `tags`, `specifications` | Product tags / final specifications |

Qty column is **read-only** in review (from Map step).

---

## Standardize step — mappable targets (Step 1)

From `apps/inventory/manifest_standard_fields.py`:

**Target flat:** `quantity`, `unit_retail`, `title`, `brand`, `model`, `condition`, `notes`

**Buckets:** `identifiers.*` (source ID + tracking-like fields), `taxonomy.*` (source category-like fields; a raw `taxonomy` source column maps to `taxonomy.taxonomy`), `specifications.*`

---

## Gaps / alignment watchlist

*Superseded in part by [product_item_field_audit/](./product_item_field_audit/README.md), especially [`02_field_lineage.md`](./product_item_field_audit/02_field_lineage.md) and [`03_current_code_audit.md`](./product_item_field_audit/03_current_code_audit.md). Items below remain until Phase 3 implementation closes them.*

1. **`location`** — Internal inventory location only; not ingest lineage. Add Item form shows it but create API omits it; processing sets it from dispatch at check-in.
2. **`description`** — Target removes ManifestRow/Preprocessing/Processing description lineage. Template Formula creates Title directly; Product description is manual/catalog detail only.
3. **`condition`** — Must use standard condition set from `ai_condition` through `Item.condition`; not in row defaults toolbar (row layer exists).
4. **`specifications`** — Preproc Review patch + Add Item; Detailed check-in passes through but no editor.
5. **Product tags / search** — Target: Product owns AI/manual `tags`; product search uses indexed fields, identifiers JSON, and tags. Do not add `Product.search_string` unless profiling proves it necessary.
6. **Category lineage** — ManifestRows store source category-like fields in `taxonomy` JSON (`department`, `gl_category`, `seller_category`, `taxonomy`, etc.). Raw has no special `taxonomy` object; if a vendor has a taxonomy column, it maps to a key inside `ManifestRow.taxonomy`. AI cleanup must produce non-null canonical `ai_category`; `final_category` → `ProcessingRow.category` → `Product.category` stay canonical.
7. **Add Item `status`** — Creates as intake; processing check-in creates as `on_shelf` immediately.
8. **`Item.title` / `Item.brand`** — Duplicated on Item; target: Product-only identity, serializer virtual fields ([planning pack](./product_item_field_audit/03_current_code_audit.md)).
9. **`Product.upc` / `default_price`** — Flat UPC moves to `identifiers` JSON; `default_price` is removed fully. Product has no price source ([search/identifier plan](./product_item_field_audit/07_search_identifiers_tags.md)).
10. **`Item.product` nullable** — Target: `NOT NULL` + `PROTECT` after backfill. Null-product Items reuse exact Products by identifiers/identity, get rough Products created from meaningful Item data, or attach to Generic Product when not meaningful ([migration plan](./product_item_field_audit/04_data_migration_backfill.md)).
11. **`processing_tier` / `batch_group`** — Old batch queue; modern collapse on `ProcessingRow` ([code audit](./product_item_field_audit/03_current_code_audit.md)).
12. **`retail` vs `price`** — Separate lineages; upstream remains `unit_retail` while quantity exists: `Raw.unit_retail` → `MR.unit_retail` → `PR.unit_retail` → `ProcessingRow.unit_retail` → `Item.retail` + cost; `shelf_price` → `Item.price` — not interchangeable ([lineage plan](./product_item_field_audit/02_field_lineage.md)).
13. **`unit_count`** — Remove. All Items represent exactly 1 unit for now; remove `ProcessingRow.units_per_item` → `Item.unit_count` flow ([backend plan](./product_item_field_audit/05_backend_implementation_plan.md)).
14. **POS Product reads** — When POS needs Product identity from Item, use joined ORM queries such as `select_related('product')` to avoid N+1 lookups ([backend plan](./product_item_field_audit/05_backend_implementation_plan.md)).

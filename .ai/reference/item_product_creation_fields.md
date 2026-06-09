# Item / product creation fields — cross-surface matrix

Fields that affect **Product** and **Item** identity, pricing, or intake defaults across preprocessing, processing, Add Item, and Detailed check-in.

**Last reviewed:** 2026-06-09 (code: `ManifestRow`, `PreprocessingRow`, `ProcessingRow`, `Product`, `Item`, `ItemSerializer`, processing UI, `ItemForm`).

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
| `Product` | `product_number` | `PRD-#####` | — | Read (if matched) | — | Auto (on create) | Read (search) | Assigned on first product save |
| `Product` | `title` | string ≤ 300 | Map (optional `title` target), AI → Review | **Edit** | — | **Edit** (required) | **Edit** (`title` / `pTitle`) | Item.title copied from product at check-in |
| `Product` | `brand` | string ≤ 200 | Map, AI → Review | **Edit** | — | **Edit** (default “Generic”) | **Edit** | |
| `Product` | `model` | string ≤ 200 | Map, AI → Review | **Edit** | — | **Edit** | **Edit** | Lives on `Product`; exposed on Item via `product_model` |
| `Product` | `category` | taxonomy v1 string ≤ 200 | Map (`taxonomy.category`), AI → Review | **Edit** | — | **Edit** (required) | **Edit** | Also `ManifestRow.category` / `ProcessingRow.category` |
| `Product` | `upc` | string ≤ 100 | Map (`identifiers.upc`), Layer | **Edit** (in `identifiers.upc`) | — | **Edit** | **Edit** | Primary identifier in UI; other keys in JSON |
| `Product` | `description` | text | Map (`description`), Layer | — | — | — | — | Preproc description; not in proc row defaults toolbar |
| `Product` | `specifications` | JSON object | Map (open bucket), Review (patch) | Layer (row `specifications`) | — | **Edit** (JSON text) | Seed (payload) | Detailed check-in sends `row.specs`; no dedicated editor in dialog |
| `Product` | `default_price` | decimal(10,2) | — | — | — | — | — | Set from manual-item resolver using shelf price when product created |
| `Product` | `matched_product` / `product_id` | FK | AI match / Layer | Read | — | — | **Edit** (`product_mode`, `product_id`) | Modes: keep, edit, existing, new |

### Identifiers bucket (`identifiers.*`)

Stored on row models as JSON; suggested keys from `manifest_standard_fields.IDENTIFIER_LOOKUP_ORDER`.

| Sub-key | Format | Preproc | Proc defaults | Add Item | Detailed check-in |
|---------|--------|---------|---------------|----------|-------------------|
| `upc` | string | Map | **Edit** (modal) | **Edit** (top-level `upc`) | **Edit** |
| `asin` | string | Map | **Edit** | — | — |
| `sku` / `item_number` / `mpn` / `ean` / `gtin` | string | Map | **Edit** | — | — |

### Taxonomy bucket (`taxonomy.*`)

| Sub-key | Format | Preproc | Proc defaults | Add Item | Detailed check-in |
|---------|--------|---------|---------------|----------|-------------------|
| `category` | string | Map | — (flat `category` used in UI) | — (flat `category`) | — (flat `category`) |
| `subcategory`, `department`, etc. | string | Map | — | — | — |

### Tracking bucket (`tracking.*`)

| Sub-key | Format | Preproc | Proc defaults | Add Item | Detailed check-in |
|---------|--------|---------|---------------|----------|-------------------|
| `lot_id`, `pallet_id`, `lpn`, `location` | string | Map | Layer only | — | — |

---

## Search & notes

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| `PreprocessingRow` / rows | `search_tags` | string[] (slugified) | Map, Review patch | **Edit** (Tags modal) | — | **Edit** (tag chips) | — | Merged into product specs in manual-item path |
| `ProcessingRow` / `Item` | `notes` | text | Map, Review patch | **Edit** (Notes modal) | — | **Edit** | **Edit** | Row notes vs item notes at check-in |

---

## Condition & dispatch / location

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| Row / `Item` | `condition` | enum: new, like_new, very_good, good, fair, salvage, unknown | Map, Review | Layer (row default) | **Edit** | **Edit** | **Edit** | UI labels: “Used Good” → `good`, etc. |
| `ProcessingRow` | `list_dispatch` / `dispatch` | on_shelf, restoration, back_storage, online_sales, salvage | — | Layer | **Edit** | — | **Edit** | Salvage condition forces salvage dispatch |
| `Item` | `location` | string ≤ 100 | — | — | Create (from dispatch) | Form only† | Create (from dispatch) | †Shown in Add Item form but **not** sent on create POST; set on update |

---

## Pricing

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| Row | `unit_retail` | decimal(10,2) | Map (required), Review read | **Edit** (“Retail”) | — | **Edit** (`retail_value`) | **Edit** (`retail` / `unit_retail`) | Vendor MSRP per unit |
| Row | `proposed_price` | decimal | AI, Review read | Layer | — | — | — | “Ideal” pricing in review |
| Row | `final_price` | decimal | Review **Edit** | Layer → `shelf_price` seed | — | — | — | Becomes processing shelf default |
| `ProcessingRow` | `shelf_price` / `price` | decimal | Finalize | **Edit** (“Price”) | **Edit** | **Edit** (`price`) | **Edit** (“Shelf price”) | Canonical processor shelf/tag price |
| `Item` | `price` | decimal | — | — | Create | **Edit** | Create | Copied to label print text |
| `Item` | `cost` | decimal | — | — | Auto (PO allocation) | Auto | Auto | From `PurchaseOrder.compute_item_cost(unit_retail)` |
| Row | `pricing_stage` | unpriced \| draft \| final | Layer | — | — | — | — | Preproc pricing workflow |
| Row | `pricing_notes` | text | Review patch | — | — | — | — | |
| Row | `batch_flag` | bool | Review patch | — | — | — | — | Batch manifest line marker |

---

## Item intake & linkage (creation-time)

| Table | Field | Format | Preproc | Proc defaults | Proc quick | Add Item | Detailed check-in | Notes |
|-------|-------|--------|---------|---------------|------------|----------|-------------------|-------|
| `Item` | `sku` | string unique | — | — | Auto | Auto | Auto | Generated on save |
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
| Row layers | `standard_*`, `ai_*`, `final_*` | per field | Layer | — | — | — | Three-layer staging; Review edits write `final_*` |

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
| `price` / `shelf_price` | Item.price | No (falls back to row) |
| `retail` / `unit_retail` | Item.unit_retail | No |
| `notes` | Item.notes | No |
| `specifications` | Item.specifications | No (defaults from row) |
| `search_tags` | product merge | No (defaults from row) |

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
| Identifiers | `identifiers` | `ProcessingRow.identifiers` (+ sync to `ManifestRow`) |
| Tags | `search_tags` | `ProcessingRow.search_tags` |
| Notes | `notes` | `ProcessingRow.notes` |

Not in row-defaults toolbar today but patchable: `description`, `condition`, `proposed_price`, `final_price`.

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
| Description | `description` | `final_description` (display under title) |
| Notes | `notes` | `final_notes` |
| Batch | `batch_flag` | |
| Tags / specs | `search_tags`, `specifications` | `final_*` buckets |

Qty column is **read-only** in review (from Map step).

---

## Standardize step — mappable targets (Step 1)

From `apps/inventory/manifest_standard_fields.py`:

**Flat:** `quantity`, `unit_retail`, `description`, `brand`, `model`, `condition`, `notes`, `search_tags` (+ optional `title`)

**Buckets:** `identifiers.*`, `taxonomy.*`, `specifications.*`, `tracking.*`

---

## Gaps / alignment watchlist

1. **`location`** — Add Item form shows it but create API omits it; processing sets it from dispatch at check-in.
2. **`description`** — Preproc + row model; not in Processing row defaults UI.
3. **`condition`** — Preproc Review + quick/detailed check-in; not in row defaults toolbar (row layer exists).
4. **`specifications`** — Preproc Review patch + Add Item; Detailed check-in passes through but no editor.
5. **`search_tags`** — Preproc Review + row defaults Tags; Add Item chips; not in Detailed check-in UI.
6. **Product vs row category** — Flat `category` in UI; taxonomy bucket subkeys only in Map step.
7. **Add Item `status`** — Creates as intake; processing check-in creates as `on_shelf` immediately.

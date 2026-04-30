# Old data model — inventory intake (field-level)

Postgres-oriented types; Django field names as in [`apps/inventory/models.py`](../../../apps/inventory/models.py). FK targets use **`→ Model`**. User FKs → **`accounts.User`**.

---

## `inventory_vendor`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | Auto |
| name | varchar(200) | |
| code | varchar(20) unique | |
| vendor_type | varchar(20) | choices: liquidation, retail, direct, other |
| contact_name | varchar(200) | blank ok |
| contact_email | varchar(254) | EmailField |
| contact_phone | varchar(30) | |
| address | text | |
| notes | text | |
| is_active | boolean | default true |
| created_at | timestamptz | auto_now_add |

---

## `inventory_category`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| name | varchar(200) unique | |
| slug | varchar(200) unique | auto from name |
| parent_id | bigint FK nullable | → self |
| spec_template | jsonb | default `[]` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## `inventory_purchaseorder`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| vendor_id | bigint FK | → Vendor CASCADE |
| order_number | varchar(100) unique | e.g. PO-00001 |
| status | varchar(20) | ordered→cancelled choices |
| ordered_date | date | |
| paid_date | date | nullable |
| shipped_date | date | nullable |
| expected_delivery | date | nullable |
| delivered_date | date | nullable |
| purchase_cost | numeric(10,2) | nullable |
| shipping_cost | numeric(10,2) | nullable |
| fees | numeric(10,2) | nullable |
| total_cost | numeric(10,2) | nullable |
| retail_value | numeric(10,2) | nullable; PO-level listing total |
| condition | varchar(20) | PO condition choices |
| description | varchar(500) | |
| item_count | integer | default 0 |
| notes | text | |
| ai_cleanup_generation | integer ≥0 | cancel-ai-cleanup guard |
| manifest_id | bigint FK nullable | → core.S3File SET_NULL |
| manifest_preview | jsonb | nullable |
| est_shrink | numeric(5,4) | 0–0.9999; shrink fraction |
| created_by_id | bigint FK nullable | → User SET_NULL |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## `inventory_csvtemplate`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| vendor_id | bigint FK | → Vendor CASCADE |
| name | varchar(200) | |
| header_signature | varchar(255) | |
| column_mappings | jsonb | default `[]` |
| is_default | boolean | |
| created_at | timestamptz | |

---

## `inventory_manifestrow`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| purchase_order_id | bigint FK | → PurchaseOrder CASCADE |
| row_number | integer | |
| quantity | integer | default 1 |
| description | text | |
| title | varchar(300) | |
| brand | varchar(200) | |
| model | varchar(200) | |
| category | varchar(200) | free text |
| condition | varchar(20) | ManifestRow condition choices |
| retail_value | numeric(10,2) | nullable |
| proposed_price | numeric(10,2) | nullable |
| final_price | numeric(10,2) | nullable |
| pricing_stage | varchar(20) | unpriced/draft/final |
| pricing_notes | text | |
| upc | varchar(100) | |
| vendor_item_number | varchar(100) | |
| batch_flag | boolean | |
| search_tags | text | |
| specifications | jsonb | default `{}` |
| matched_product_id | bigint FK nullable | → Product SET_NULL |
| match_status | varchar(20) | pending/matched/new |
| match_candidates | jsonb | default `[]` |
| ai_match_decision | varchar(20) | AI_MATCH_DECISION choices |
| ai_reasoning | text | |
| ai_suggested_* | varchar | title/brand/model fields |
| notes | text | |

---

## `inventory_preprocessingorder`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| purchase_order_id | bigint FK unique | → PurchaseOrder CASCADE 1:1 |
| workflow_status | varchar(20) | draft→finalized |
| current_step | smallint | 0 std / 1 AI / 2 review |
| manifest_headers | jsonb | default `[]` |
| header_signature | varchar(255) | |
| standardization_formulas | jsonb | default `{}` |
| template_id | bigint FK nullable | → CSVTemplate SET_NULL |
| template_name | varchar(200) | |
| row_count | integer ≥0 | |
| standardized_at | timestamptz | nullable |
| last_ai_import_at | timestamptz | nullable |
| review_saved_at | timestamptz | nullable |
| finalized_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## `inventory_preprocessingrow`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| preprocessing_order_id | bigint FK | → PreprocessingOrder CASCADE |
| purchase_order_id | bigint FK | → PurchaseOrder CASCADE |
| row_number | integer ≥0 | unique per prep order |
| raw_row | jsonb | default `{}` |
| quantity … notes | same shapes as ManifestRow | mirrors line semantics |
| ai_* text fields | varchar/text | same idea as manifest AI suggestions |
| updated_at | timestamptz | |

Unique constraint: `(preprocessing_order_id, row_number)`.

---

## `inventory_product`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| product_number | varchar(20) unique nullable | PRD-* |
| title | varchar(300) | |
| brand | varchar(200) | |
| model | varchar(200) | |
| category | varchar(200) | denormalized text |
| category_ref_id | bigint FK nullable | → Category SET_NULL |
| description | text | |
| specifications | jsonb | |
| default_price | numeric(10,2) | nullable |
| upc | varchar(100) | |
| times_ordered | integer | |
| total_units_received | integer | |
| is_active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## `inventory_vendorproductref`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| vendor_id | bigint FK | CASCADE |
| product_id | bigint FK | CASCADE |
| vendor_item_number | varchar(100) | |
| vendor_description | varchar(500) | |
| last_unit_cost | numeric(10,2) | nullable |
| times_seen | integer | |
| last_seen_date | date | auto_now |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Unique together: `(vendor_id, vendor_item_number)`.

---

## `inventory_batchgroup`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| batch_number | varchar(20) unique | BTH-* |
| product_id | bigint FK nullable | → Product SET_NULL |
| purchase_order_id | bigint FK nullable | → PurchaseOrder SET_NULL |
| manifest_row_id | bigint FK nullable | → ManifestRow SET_NULL |
| total_qty | integer | |
| status | varchar(20) | pending/in_progress/complete |
| unit_price | numeric(10,2) | nullable |
| unit_cost | numeric(10,2) | nullable; **legacy name — vendor retail/unit not acquisition** |
| condition | varchar(20) | BatchGroup choices |
| location | varchar(100) | |
| processed_by_id | bigint FK nullable | → User |
| processed_at | timestamptz | nullable |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## `inventory_item`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| sku | varchar(20) unique | ITM* |
| product_id | bigint FK nullable | → Product SET_NULL |
| purchase_order_id | bigint FK nullable | → PurchaseOrder SET_NULL |
| manifest_row_id | bigint FK nullable | → ManifestRow SET_NULL |
| batch_group_id | bigint FK nullable | → BatchGroup SET_NULL |
| processing_tier | varchar(20) | individual/batch |
| title | varchar(300) | |
| brand | varchar(200) | |
| category | varchar(200) | |
| price | numeric(10,2) | |
| retail_value | numeric(10,2) | nullable |
| cost | numeric(10,2) | nullable; allocated from PO |
| source | varchar(20) | purchased/consignment/misc |
| status | varchar(20) | intake→lost |
| condition | varchar(20) | Item choices |
| specifications | jsonb | |
| location | varchar(100) | |
| listed_at | timestamptz | nullable |
| checked_in_at | timestamptz | nullable |
| checked_in_by_id | bigint FK nullable | → User |
| sold_at | timestamptz | nullable |
| sold_for | numeric(10,2) | nullable |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| search_text | text | indexed denorm search |

---

## `inventory_processingbatch`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| purchase_order_id | bigint FK | → PurchaseOrder CASCADE |
| status | varchar(20) | pending/in_progress/complete |
| total_rows | integer | |
| processed_count | integer | |
| items_created | integer | |
| started_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| created_by_id | bigint FK nullable | → User |
| notes | text | |

---

## `inventory_itemhistory`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| item_id | bigint FK | → Item CASCADE |
| event_type | varchar(30) | EVENT_TYPES |
| old_value | varchar(300) | |
| new_value | varchar(300) | |
| note | text | |
| created_by_id | bigint FK nullable | → User |
| created_at | timestamptz | |

---

## `inventory_itemscanhistory`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| item_id | bigint FK | → Item CASCADE |
| scanned_at | timestamptz | |
| ip_address | inet nullable | GenericIPAddressField |
| source | varchar(20) | public_lookup/pos_terminal/audit_scan |
| outcome | varchar(30) | OUTCOME_CHOICES |
| cart_id | bigint FK nullable | → pos.Cart SET_NULL |
| created_by_id | bigint FK nullable | → User |

---

## Core tables used by intake

### `core_s3file`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| key | varchar(500) unique | S3 object key |
| filename | varchar(255) | |
| size | integer | bytes |
| content_type | varchar(100) | |
| uploaded_by_id | bigint FK nullable | → User |
| uploaded_at | timestamptz | |

### `core_appsetting`

| Field | Type | Notes |
|-------|------|-------|
| id | bigint PK | |
| key | varchar(100) unique | e.g. AI cleanup JSON blobs |
| value | jsonb | |
| description | varchar(255) | |
| updated_by_id | bigint FK nullable | → User |
| updated_at | timestamptz | |

Keys touched by preprocessing cleanup logic include **`ai_inventory_cleanup_models`** and **`ai_default_inventory_cleanup_model`** (verify in [`apps/inventory/views.py`](../../../apps/inventory/views.py)).

# DB2 Schema — 2nd Gen Dashboard (Production on Heroku)

> **True production home:** Heroku PostgreSQL `d4op06smk6i192` ("EcoThrift - Production" in PgAdmin)
> **Audited against:** Local restore via `backup_prod.bat` → `restore_dev.bat` into `db2` on localhost:5432
> **Backup/restore scripts:** `workspace/notes/backup_prod.bat` and `workspace/notes/restore_dev.bat`
> **Audit date:** 2026-03-04 (backup captured today — production data is current)

---

## Table Row Counts (from live production restore)

| Table | Rows | Description |
|---|---|---|
| `inventory_item_scan_history` | 403,239 | Customer QR/barcode scan events |
| `temp_old_items` | 123,941 | **All DB1 items imported** — denormalized with product info joined |
| `inventory_item` | 59,833 | Current inventory items |
| `inventory_processing_detail` | 54,611 | Processing audit snapshot per item (init + final prices) |
| `inventory_item_history` | 54,250 | Item state change audit log |
| `pos_cart_line` | 42,586 | Sale line items |
| `inventory_product` | 41,509 | Product catalog |
| `inventory_manifest_rows` | 36,330 | Manifest rows from purchase orders |
| `inventory_preprocessing_detail` | 36,330 | AI preprocessing per manifest row |
| `pos_cart` | 16,275 | Sale transactions |
| `pos_receipt` | 15,306 | Receipt records |
| `pos_payment` | 15,306 | Payment records |
| `migrated_items` | 5,212 | Items already migrated from DB1 to DB2 |
| `hr_time_entry` | 1,582 | Employee time clock entries |
| `pos_drawer_shift` | 963 | Drawer shift/handoff records |
| `pos_drawer` | 229 | Cash drawer sessions |
| `pos_revenue_goal` | 182 | Daily revenue goals |
| `inventory_csv_field_mapping` | 120 | CSV field mapping definitions |
| `inventory_purchase_order` | 103 | Purchase orders |
| `django_migrations` | 88 | Applied migrations |
| `inventory_standardization_run` | 62 | Manifest standardization runs |
| `inventory_raw_manifest` | 61 | Raw manifest file records |
| `core_employee_profile` | 39 | Employee profile extensions |
| `core_user` | 39 | User accounts |
| `pos_cash_deposit` | 13 | Cash deposit records |
| `pos_bank_transaction` | 12 | Bank deposit records |
| `inventory_location` | 11 | Shelf/zone locations |
| `inventory_csv_template` | 10 | CSV import templates |
| `inventory_store_configuration` | 9 | App configuration key-value store |
| `inventory_vendor` | 9 | Vendor records |
| `pos_transaction_void` | 7 | Voided transactions |
| `hr_department` | 7 | Departments |
| `core_work_location` | 5 | Work locations |
| `pos_register` | 5 | POS register definitions |
| `inventory_pricing_template` | 4 | Pricing template definitions |
| `pos_discount_rule` | 2 | Discount rules |
| `inventory_product_class` | 0 | Product classes (unused) |
| All other HR tables | 0 | `hr_pto_*`, `hr_schedule`, `hr_shift`, etc. |

---

## Key Table Schemas

### `inventory_item`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `sku` | varchar(50) | NO | Unique scan code (e.g. `ITMNDMA68E`) |
| `serial_number` | varchar(100) | YES | |
| `bulk_id` | varchar(20) | YES | |
| `bulk_quantity` | integer | YES | |
| `pricing_type` | varchar(20) | NO | `discounting`, `express`, `static` |
| `starting_price` | numeric | NO | **Shelf/sticker price** |
| `retail_amt` | numeric | YES | Estimated retail reference |
| `disc_a` | numeric | YES | Primary discount multiplier (e.g. 0.15 = 15%) |
| `disc_b` | numeric | YES | Secondary discount multiplier (e.g. 0.015 = 1.5%) |
| `on_shelf_at` | date | YES | Date placed on shelf |
| `processing_completed_at` | timestamptz | YES | |
| `sold_at` | timestamptz | YES | |
| `sold_for` | numeric | YES | Actual sale price |
| `last_printed_at` | timestamptz | YES | |
| `sku_print_count` | integer | NO | |
| `manifest_row_id` | bigint FK | YES | → `inventory_manifest_rows` |
| `product_id` | bigint FK | YES | → `inventory_product` (100% populated) |
| `product_class_id` | bigint FK | YES | → `inventory_product_class` |
| `inventory_purchase_order_id` | bigint FK | YES | → `inventory_purchase_order` |

### `inventory_product`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `title` | varchar(500) | NO | Full product title |
| `brand` | varchar(200) | NO | Brand |
| `model` | varchar(200) | NO | Model |
| `match_count` | integer | NO | How many items share this product |
| `last_matched_at` | timestamptz | YES | |
| `ai_suggested_title` | varchar(200) | NO | |
| `ai_confidence` | numeric | YES | |
| `product_class_id` | bigint FK | YES | |
| `created_at` / `updated_at` | timestamptz | NO | |

### `inventory_processing_detail`
The richest table in DB2 — captures a full before/after snapshot every time an item is processed.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK |
| `item_id` / `item_sku` | integer / varchar | FK to item + denormalized SKU |
| `manifest_row_id` / `purchase_order_id` | integer | Source context |
| `init_product_id/title/brand/model` | various | **Product BEFORE processing** |
| `init_price_type/starting/disc_a/disc_b` | various | **Price BEFORE processing** |
| `init_item_retail` | numeric | Retail value before |
| `final_product_id/title/brand/model` | various | **Product AFTER processing** |
| `final_price_type/starting/disc_a/disc_b` | various | **Price AFTER processing** |
| `final_item_retail` | numeric | Retail value after |
| `manifest_description/brand/model` | text/varchar | Raw manifest source data |
| `manifest_retail_value` | numeric | Manifest retail hint |
| `status` / `product_status` / `pricing_status` | varchar | Workflow step statuses |
| `item_history_condition/location_id/notes` | various | Condition at processing |
| `print_counter` | integer | How many labels printed |
| `processed_at` | timestamptz | When processed |
| `processed_by_id` | integer | Staff member |

### `inventory_preprocessing_detail`
AI-assisted matching step that runs before processing.

| Column | Type | Notes |
|---|---|---|
| `manifest_row_id` | bigint FK | One record per manifest row |
| `manifest_description/brand/model` | text | Raw manifest data |
| `manifest_retail_value` | numeric | Retail from manifest |
| `ai_generated_title/brand/model` | varchar | AI's suggested product info |
| `ai_generation_status` | varchar | `pending`, `complete`, `failed` |
| `suggested_manifest_matches` | jsonb | Top manifest match candidates |
| `selected_manifest_match_id` | integer | Staff-chosen match |
| `product_match_status` | varchar | Match outcome |
| `suggested_product_matches` | jsonb | Top product catalog candidates |
| `selected_product_match_id` | integer | Staff-chosen product |
| `pricing_type` | varchar | Suggested pricing type |
| `starting_price` / `disc_a` / `disc_b` | numeric | Suggested prices |
| `is_bulk` / `bulk_quantity` | boolean/int | Batch handling |
| `item_rows_generated_count` | integer | Items created from this row |

### `inventory_manifest_rows`
| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK |
| `purchase_order_id` | bigint FK | Parent PO |
| `row_number` | integer | Line number on manifest |
| `description` | text | Raw manifest description |
| `brand` / `model` / `category` / `subcategory` | varchar | Manifest fields |
| `retail_value` | numeric | Vendor retail hint |
| `upc` / `sku` / `vendor_sku` / `pallet_id` / `box_id` | varchar | Product identifiers |
| `quantity` | integer | Units on this row |
| `search_terms` | text | Generated for product matching |

### `temp_old_items`
**Denormalized copy of all 123,941 DB1 items with product info pre-joined.** Critical for migration.

| Column | Type | Notes |
|---|---|---|
| `item_code` | char(9) | DB1 item code (primary key in DB1) |
| `bulk_cde` | char(9) | DB1 bulk parent code |
| `quantity` | integer | |
| `order_number` / `line_number` | text/int | DB1 purchase order reference |
| `price_lbl` | varchar(9) | DB1 price ladder code |
| `retail_amt` | numeric | DB1 retail estimate |
| `starting_price_amt` | numeric | DB1 starting price |
| `is_static` | boolean | DB1 static pricing flag |
| `product_code` | char(9) | DB1 product code |
| `product_title` | text | **DB1 product title — pre-joined** |
| `product_brand` | text | **DB1 product brand — pre-joined** |
| `product_model` | text | **DB1 product model — pre-joined** |

### `migrated_items`
Tracks which DB1 items have been successfully imported into DB2.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | PK |
| `old_item_code` | varchar(9) | DB1 `item.code` |
| `new_item_id` | integer | DB2 `inventory_item.id` |
| `new_product_id` | integer | DB2 `inventory_product.id` |
| `new_sku` | varchar(50) | New format SKU assigned |
| `pricing_type` | varchar(20) | Pricing type assigned |
| `condition` | varchar(20) | Condition assigned |
| `migrated_at` | timestamptz | When migrated |
| `migrated_by_id` | integer | Who ran migration |

### `pos_cart`
| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK |
| `status` | varchar(20) | `completed`, `cancelled`, `active` |
| `subtotal` / `tax_amount` / `total` | numeric | |
| `tax_rate` | numeric | e.g. 0.07 |
| `credit_card_fee` | numeric | Card processing fee |
| `cashier_id` | bigint FK | |
| `customer_id` | bigint FK | YES |
| `drawer_id` | bigint FK | |
| `created_at` / `completed_at` / `updated_at` | timestamptz | |

### `pos_cart_line`
| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK |
| `cart_id` | bigint FK | |
| `item_id` | bigint FK | YES (nullable for non-inventory lines) |
| `product_title/brand/model` | varchar | **Snapshot at time of sale** |
| `quantity` | integer | |
| `unit_price` | numeric | Price at sale |
| `line_total` | numeric | |
| `discount_rule_id` | bigint FK | YES |

### `pos_drawer`
| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK |
| `register_id` / `cashier_id` | bigint FK | |
| `drawer_date` | date | |
| `opened_at` / `closed_at` | timestamptz | |
| `opening_cash` / `closing_cash` / `expected_cash` | numeric | Totals (not denomination breakdown) |
| `notes` | text | |

### `pos_drawer_shift`
Handoff/count events within a drawer session.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK |
| `drawer_id` | bigint FK | |
| `type` | varchar(20) | `open`, `close`, `handoff`, `count` |
| `counted_cash` / `expected_cash` / `variance` | numeric | |
| `cash_breakdown` | jsonb | **Denomination breakdown** |
| `variance_reason` / `variance_approved` | text/bool | Variance handling |
| `previous_cashier_id` / `new_cashier_id` | bigint FK | YES |
| `verified_by_id` | bigint FK | YES |
| `created_at` / `ended_at` | timestamptz | |

### `core_user`
| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK |
| `email` | varchar(254) UNIQUE | Primary login |
| `username` | varchar(150) | |
| `first_name` / `last_name` / `middle_name` | varchar | |
| `phone` | varchar(20) | |
| `birth_date` | date | YES |
| `is_employee` / `is_customer` | boolean | Role flags |
| `is_staff` / `is_superuser` / `is_active` | boolean | |
| `emergency_contact_name/phone/relationship` | varchar | |
| `work_location_id` | bigint FK | YES |
| `date_joined` / `updated_at` | timestamptz | |

### `hr_time_entry`
| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK |
| `user_id` / `department_id` | bigint FK | |
| `clock_in` / `clock_out` | timestamptz | |
| `modified_in` / `modified_out` | timestamptz | YES — adjusted times |
| `modify_reason` | text | |
| `total_hours` | numeric | YES — computed |
| `approved` | boolean | |
| `approved_at` / `approved_by_id` | timestamptz/FK | YES |

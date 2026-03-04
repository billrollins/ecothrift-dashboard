# DB3 Schema — ecothrift_v2

> Extracted live via psql on 2026-03-04. This is the 3rd-gen dev database for the `ecothrift-dashboard` project.
> Row counts reflect test/dev data only — not production volumes.

## Table Row Counts

| Table | Rows | Description |
|---|---|---|
| `inventory_itemhistory` | 1,169 | Item state/price change audit log |
| `inventory_item` | 1,149 | Inventory items (test data) |
| `inventory_vendorproductref` | 580 | Vendor product reference records |
| `inventory_product` | 532 | Product catalog (test data) |
| `inventory_manifestrow` | 470 | Manifest rows (test data) |
| `django_migrations` | 46 | Applied Django migrations |
| `inventory_batchgroup` | 42 | Batch groups from manifests |
| `pos_cartline` | 14 | POS cart lines (test sales) |
| `pos_cart` | 10 | POS carts (test sales) |
| `core_appsetting` | 6 | App configuration settings |
| `accounts_user` | 4 | User accounts |
| `accounts_consigneeprofile` | 3 | Consignee profiles |
| `pos_drawer` | 3 | Cash drawers |
| `inventory_csvtemplate` | 2 | CSV import templates |
| `pos_register` | 2 | POS registers |
| `accounts_employeeprofile` | 2 | Employee profiles |
| `inventory_vendor` | 2 | Vendors |
| `hr_sickleavebalance` | 1 | Sick leave balance |
| `inventory_purchaseorder` | 1 | Purchase order |
| `core_worklocation` | 1 | Work location |
| `consignment_consignmentagreement` | 1 | Consignment agreement |
| `hr_department` | 1 | Department |
| `inventory_processingbatch` | 1 | Processing batch |
| `hr_timeentry` | 0 | Time entries |
| `inventory_itemscanhistory` | 0 | Item scan history |
| `consignment_consignmentpayout` | 0 | Consignment payouts |
| `consignment_consignmentitem` | 0 | Consignment items |
| `accounts_customerprofile` | 0 | Customer profiles |
| `inventory_category` | 0 | Item categories (to be seeded) |

---

## Full Schema

### `accounts_user`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `email` | varchar(254) | NO | Unique, primary login |
| `first_name` / `last_name` | varchar(150) | NO | |
| `phone` | varchar(30) | NO | |
| `is_active` | boolean | NO | |
| `is_staff` | boolean | NO | |
| `is_superuser` | boolean | NO | |
| `date_joined` / `updated_at` | timestamptz | NO | |
| `last_login` | timestamptz | YES | |

### `accounts_employeeprofile`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `user_id` | bigint FK | NO | → `accounts_user` |
| `employee_number` | varchar(20) | NO | |
| `position` | varchar(100) | NO | |
| `employment_type` | varchar(20) | NO | |
| `pay_rate` | numeric | NO | |
| `hire_date` | date | NO | |
| `termination_date` | date | YES | |
| `termination_type` | varchar(40) | NO | |
| `termination_notes` | text | NO | |
| `emergency_name` | varchar(150) | NO | |
| `emergency_phone` | varchar(30) | NO | |
| `department_id` | bigint FK | YES | → `hr_department` |
| `work_location_id` | bigint FK | YES | → `core_worklocation` |
| `created_at` | timestamptz | NO | |

### `accounts_consigneeprofile`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `user_id` | bigint FK | NO | → `accounts_user` |
| `consignee_number` | varchar(20) | NO | |
| `commission_rate` | numeric | NO | |
| `payout_method` | varchar(20) | NO | |
| `status` | varchar(20) | NO | |
| `join_date` | date | NO | |
| `notes` | text | NO | |
| `created_at` | timestamptz | NO | |

### `consignment_consignmentagreement`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `agreement_number` | varchar(20) | NO | |
| `consignee_id` | bigint FK | NO | → `accounts_consigneeprofile` |
| `commission_rate` | numeric | NO | |
| `status` | varchar(20) | NO | |
| `start_date` | date | NO | |
| `end_date` | date | YES | |
| `terms` | text | NO | |
| `created_at` | timestamptz | NO | |

### `consignment_consignmentitem`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `agreement_id` | bigint FK | NO | |
| `item_id` | bigint FK | NO | → `inventory_item` |
| `asking_price` | numeric | NO | |
| `listed_price` | numeric | NO | |
| `status` | varchar(20) | NO | |
| `received_at` | timestamptz | NO | |
| `listed_at` | timestamptz | YES | |
| `sold_at` | timestamptz | YES | |
| `sale_amount` | numeric | YES | |
| `store_commission` | numeric | YES | |
| `consignee_earnings` | numeric | YES | |

### `inventory_item`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `sku` | varchar(50) | NO | Unique scan code |
| `title` | varchar(300) | NO | Display title (may differ from product) |
| `price` | numeric | YES | **Current/active shelf price** |
| `cost` | numeric | YES | What store paid |
| `sold_for` | numeric | YES | Actual sale price |
| `source` | varchar(20) | NO | `bstock`, `consignment`, `direct` |
| `status` | varchar(20) | NO | `pending`, `processing`, `on_shelf`, `sold`, etc. |
| `condition` | varchar(20) | NO | `new`, `open_box`, `good`, `fair`, `poor` |
| `processing_notes` | text | NO | Freeform notes from processor |
| `on_shelf_at` | date | YES | |
| `sold_at` | timestamptz | YES | |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | |
| `product_id` | bigint FK | YES | → `inventory_product` |
| `purchase_order_id` | bigint FK | YES | → `inventory_purchaseorder` |
| `manifest_row_id` | bigint FK | YES | → `inventory_manifestrow` |
| `batch_group_id` | bigint FK | YES | → `inventory_batchgroup` |
| `location_id` | bigint FK | YES | → (location table) |

### `inventory_product`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `product_number` | varchar(20) | YES | Unique product code |
| `title` | varchar(300) | NO | |
| `brand` | varchar(200) | NO | |
| `model` | varchar(200) | NO | |
| `category` | varchar(200) | NO | Text category (legacy) |
| `category_ref_id` | bigint FK | YES | → `inventory_category` |
| `description` | text | NO | |
| `default_price` | numeric | YES | Default starting price |
| `upc` | varchar(100) | NO | |
| `specifications` | jsonb | NO | Structured specs |
| `is_active` | boolean | NO | |
| `times_ordered` | integer | NO | |
| `total_units_received` | integer | NO | |
| `created_at` / `updated_at` | timestamptz | NO | |

### `inventory_category`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `name` | varchar(100) | NO | |
| `slug` | varchar(100) | NO | Unique |
| `parent_id` | bigint FK | YES | Self-referential hierarchy |
| `description` | text | NO | |
| `spec_template` | jsonb | NO | Expected spec keys for this category |
| `is_active` | boolean | NO | |
| `created_at` | timestamptz | NO | |

### `inventory_purchaseorder`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `order_number` | varchar(100) | NO | |
| `vendor_id` | bigint FK | NO | → `inventory_vendor` |
| `manifest_id` | bigint FK | YES | → uploaded manifest file |
| `status` | varchar(20) | NO | |
| `ordered_date` | date | NO | |
| `expected_delivery` / `delivered_date` / `shipped_date` / `paid_date` | date | YES | |
| `purchase_cost` | numeric | YES | |
| `shipping_cost` | numeric | YES | |
| `fees` | numeric | YES | |
| `total_cost` | numeric | YES | |
| `retail_value` | numeric | YES | |
| `item_count` | integer | NO | |
| `condition` | varchar(20) | NO | |
| `description` | varchar(500) | NO | |
| `manifest_preview` | jsonb | YES | |

### `inventory_manifestrow`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `purchase_order_id` | bigint FK | NO | |
| `row_number` | integer | NO | |
| `title` | varchar(300) | NO | AI-suggested or raw title |
| `description` | text | NO | Raw manifest description |
| `brand` | varchar(200) | NO | |
| `model` | varchar(200) | NO | |
| `category` | varchar(200) | NO | |
| `quantity` | integer | NO | |
| `retail_value` | numeric | YES | |
| `upc` / `vendor_item_number` | varchar | NO | |
| `match_status` | varchar(20) | NO | |
| `matched_product_id` | bigint FK | YES | |
| `proposed_price` | numeric | YES | Suggested price from pricing rules |
| `final_price` | numeric | YES | Confirmed price by staff |
| `pricing_stage` | varchar(20) | NO | |
| `pricing_notes` | text | NO | |
| `ai_match_decision` | varchar(20) | NO | |
| `ai_reasoning` | text | NO | |
| `ai_suggested_brand/model/title` | varchar | NO | |
| `batch_flag` | boolean | NO | |
| `condition` | varchar(20) | NO | |
| `match_candidates` | jsonb | NO | |
| `search_tags` | text | NO | |
| `specifications` | jsonb | NO | |

### `inventory_batchgroup`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `batch_number` | varchar(20) | NO | |
| `purchase_order_id` | bigint FK | NO | |
| `total_qty` | integer | NO | |
| `status` | varchar(20) | NO | |
| `unit_price` | numeric | YES | Price per unit in batch |
| `unit_cost` | numeric | YES | Cost per unit |
| `condition` | varchar(20) | NO | |
| `location` | varchar(100) | NO | |
| `processed_at` | timestamptz | YES | |
| `notes` | text | NO | |

### `pos_cart`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `status` | varchar(20) | NO | `active`, `completed`, `cancelled` |
| `subtotal` / `tax_amount` / `total` | numeric | NO | |
| `tax_rate` | numeric | NO | |
| `payment_method` | varchar(10) | NO | `cash`, `card` (denormalized) |
| `cash_tendered` / `change_given` | numeric | YES | |
| `card_amount` | numeric | YES | |
| `cashier_id` | bigint FK | NO | |
| `customer_id` | bigint FK | YES | |
| `drawer_id` | bigint FK | NO | |
| `created_at` / `completed_at` | timestamptz | | |

### `pos_cartline`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `cart_id` | bigint FK | NO | |
| `item_id` | bigint FK | YES | |
| `description` | varchar(300) | NO | Title snapshot |
| `quantity` | integer | NO | |
| `unit_price` | numeric | NO | |
| `line_total` | numeric | NO | |
| `created_at` | timestamptz | NO | |

### `pos_drawer`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `register_id` | bigint FK | NO | |
| `date` | date | NO | |
| `status` | varchar(10) | NO | |
| `opened_at` | timestamptz | NO | |
| `opening_count` | jsonb | NO | Denomination breakdown |
| `opening_total` | numeric | NO | |
| `closed_at` | timestamptz | YES | |
| `closing_count` | jsonb | YES | |
| `closing_total` | numeric | YES | |
| `cash_sales_total` | numeric | NO | |
| `expected_cash` | numeric | YES | |
| `variance` | numeric | YES | |
| `opened_by_id` / `closed_by_id` / `current_cashier_id` | bigint FK | | |

### `hr_timeentry`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `employee_id` | bigint FK | NO | |
| `date` | date | NO | |
| `clock_in` / `clock_out` | timestamptz | NO/YES | |
| `break_minutes` | integer | NO | |
| `total_hours` | numeric | YES | Computed |
| `status` | varchar(20) | NO | `pending`, `approved`, `modified` |
| `notes` | text | NO | |
| `approved_by_id` | bigint FK | YES | |

### `core_appsetting`
| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | NO | PK |
| `key` | varchar(100) | NO | Unique |
| `value` | jsonb | NO | |
| `description` | varchar(255) | NO | |
| `updated_at` | timestamptz | NO | |
| `updated_by_id` | bigint FK | YES | |

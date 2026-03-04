# DB2 — Full Audit
## 2nd Generation Dashboard — Current Production

> **Audited:** 2026-03-04 — **live production data** (backup pulled same day via `backup_prod.bat`, restored locally via `restore_dev.bat`)
> **Connection:** See [.config](.config) → `[db2]`
> **Schema detail:** [db2/schema.md](db2/schema.md)

### Connection Details

| | |
|---|---|
| **Production (Heroku)** | `d4op06smk6i192` on `ec2-34-237-167-13.compute-1.amazonaws.com:5432` |
| **PgAdmin** | "EcoThrift - Production" → Databases → `d4op06smk6i192` → Schemas → `public` |
| **Local snapshot** | `db2` on `localhost:5432` (postgres / password) |
| **Refresh local snapshot** | Run `backup_prod.bat` then `restore_dev.bat` from `workspace/notes/` |

---

## Overview

| Property | Value |
|---|---|
| **Generation** | 2nd |
| **Status** | Production (Heroku) |
| **Framework** | Django REST Framework + React frontend |
| **Auth model** | `core_user` (custom AbstractBaseUser, email + username login) |
| **Primary key style** | bigint auto-increment; `sku` varchar(50) for items |
| **Data since** | Aug 23, 2025 |
| **Last sale in backup** | Mar 4, 2026 (today) |
| **Tables** | 83 |
| **Django migrations** | 88 |

---

## Business Data Summary (Live Production)

| Metric | Value |
|---|---|
| **Total revenue** | $579,536.57 |
| **Completed transactions** | 15,304 |
| **Total items** | 59,833 |
| **Items sold** | 34,762 |
| **Items on shelf** | 18,572 |
| **Products in catalog** | 41,509 |
| **Customer scan events** | 403,239 |
| **Purchase orders** | 103 |
| **Manifest rows processed** | 36,330 |
| **Staff users** | 39 |
| **Cash drawers opened** | 229 |
| **Avg sold price** | $13.43 |
| **Payment split** | 73% card ($482K) / 27% cash ($97K) |

### Revenue by Month

| Month | Transactions | Revenue |
|---|---|---|
| Aug 2025 | 838 | $28,138.74 |
| Sep 2025 | 2,305 | $80,124.03 |
| Oct 2025 | 4,416 | $156,932.52 |
| Nov 2025 | 3,600 | $143,834.64 |
| Dec 2025 | 2,015 | $72,712.20 |
| Jan 2026 | 819 | $40,756.43 |
| Feb 2026 | 1,247 | $54,631.42 |
| Mar 2026 | 64 | $2,406.59 *(partial — backup date)* |

---

## Table Summary

### Core Inventory

| Table | Rows | Description |
|---|---|---|
| `inventory_item` | 59,833 | Inventory items. `pricing_type` (discounting/express/static), `starting_price`, `retail_amt`, `disc_a`, `disc_b`, `sold_for`. 100% linked to `inventory_product`. |
| `inventory_product` | 41,509 | Product catalog: `title`, `brand`, `model`, `match_count`, `ai_suggested_title`, `ai_confidence`. |
| `inventory_item_history` | 54,250 | Every condition/status/location/notes change per item. |
| `inventory_item_scan_history` | 403,239 | Public QR scan events: `ip_address`, `user_agent`, `device_type`, `session_id`. |
| `inventory_processing_detail` | 54,611 | **Gold mine for pricing model** — full before/after snapshot of every item at processing time (init + final product, price, condition). |
| `inventory_preprocessing_detail` | 36,330 | AI-assisted manifest row matching: AI-generated title/brand/model, product match candidates (jsonb), suggested prices. |
| `inventory_manifest_rows` | 36,330 | Raw manifest rows from POs: description, brand, model, retail_value, UPC, SKU, quantity. |
| `inventory_purchase_order` | 103 | PO lifecycle with retail_value, purchase_price, fees, shipping, condition, manifest file URL, timestamp pipeline. |
| `inventory_vendor` | 9 | Vendor records. |
| `inventory_location` | 11 | Shelf/zone locations. |
| `inventory_product_class` | 0 | Product class taxonomy (unused). |

### Migration Tables (Critical)

| Table | Rows | Description |
|---|---|---|
| `temp_old_items` | **123,941** | **All DB1 items imported** with product info pre-joined: `item_code` (DB1 char-9 code), `product_title/brand/model`, `starting_price_amt`, `retail_amt`. Ready to use for Retag/migration. |
| `migrated_items` | **5,212** | Items already migrated: maps `old_item_code` → `new_item_id`, `new_product_id`, `new_sku`, with `pricing_type` and `condition`. 4.2% of DB1 items migrated so far. |

### POS / Sales

| Table | Rows | Description |
|---|---|---|
| `pos_cart` | 16,275 | Transaction headers. `status`, `subtotal`, `tax_rate`, `tax_amount`, `total`, `credit_card_fee`. |
| `pos_cart_line` | 42,586 | Line items. Denormalizes `product_title/brand/model` at sale. FK to `discount_rule_id`. |
| `pos_payment` | 15,306 | Payments: `payment_method` (card/cash), `amount`, `amount_tendered`, `change_given`, `reference_number`, `card_type`. |
| `pos_receipt` | 15,306 | Receipt records (printed/emailed). |
| `pos_drawer` | 229 | Cash drawer sessions: `opening_cash`, `closing_cash`, `expected_cash`. |
| `pos_drawer_shift` | 963 | Handoff/count events: `counted_cash`, `expected_cash`, `variance`, `cash_breakdown` (jsonb denomination detail), `variance_reason/approved`. |
| `pos_register` | 5 | Register definitions with ideal denomination targets per denomination. |
| `pos_discount_rule` | 2 | Discount rule definitions (in use). |
| `pos_transaction_void` | 7 | Voided transaction records. |
| `pos_cash_deposit` | 13 | Cash deposit records. |
| `pos_bank_transaction` | 12 | Bank deposit records. |
| `pos_revenue_goal` | 182 | Daily revenue goals. |

### Users & HR

| Table | Rows | Description |
|---|---|---|
| `core_user` | 39 | Staff accounts (custom User model with `is_employee`, `is_customer`, emergency contacts). |
| `core_employee_profile` | 39 | Employee extensions: `employee_number`, `position`, `employment_type`, `hire_date`, `department_id`, `pay_grade_id`. |
| `hr_time_entry` | 1,582 | **Active** — time clock entries with `clock_in`, `clock_out`, `total_hours`, `modified_in/out`, `approved`. |
| `hr_department` | 7 | Departments. |
| `core_work_location` | 5 | Store/work locations. |

### Config & Templates

| Table | Rows | Description |
|---|---|---|
| `inventory_store_configuration` | 9 | App config key-value store (`key`, `value`, `description`). |
| `inventory_csv_template` | 10 | CSV import template definitions. |
| `inventory_csv_field_mapping` | 120 | Field mappings per CSV template. |
| `inventory_pricing_template` | 4 | Pricing template rules. |
| `inventory_raw_manifest` | 61 | Raw uploaded manifest file records. |
| `inventory_standardization_run` | 62 | Manifest standardization pipeline runs. |

---

## Architecture Notes

### Pricing System (DB2)
Items have a `pricing_type` (discounting/express/static) plus `starting_price`, `disc_a`, `disc_b`. The v2 app discounts items over time using these multipliers. `sold_for` captures actual sale price.

### AI Preprocessing Pipeline
Every manifest row goes through `inventory_preprocessing_detail` (AI match + product suggestion) before reaching `inventory_processing_detail` (staff confirmation + final price). This two-step pipeline is how 36K manifest rows and 54K processing records were generated.

### Migration State
- **`temp_old_items`** (123,941 rows) = a full denormalized copy of all DB1 items imported into DB2. Product title/brand/model are pre-joined from DB1's `product` table. This is the source for the Retag app.
- **`migrated_items`** (5,212 rows) = 4.2% of DB1 items have been fully migrated to new DB2 items with new SKUs. 95.8% are still in `temp_old_items` only.

### What IS Used vs. NOT Used
**Active in production:** inventory items, products, manifest/preprocessing pipeline, processing detail, POS (carts, payments, drawers, shifts), HR time tracking, scan history, store configuration.

**Built but unused:** `inventory_product_class`, many HR modules (`hr_pto_*`, `hr_schedule`, `hr_shift`, `hr_blackout_date`, etc.), `core_business_event`, `core_contact`, `core_customer_profile`.

---

## Cross-DB Relationships

| DB2 | DB1 Equivalent | DB3 Equivalent |
|---|---|---|
| `inventory_item.starting_price` | `item.starting_price_amt` | `inventory_item.price` |
| `inventory_item.sku` | `item.code` (via `temp_old_items.item_code`) | `inventory_item.sku` |
| `inventory_product.title/brand/model` | `product.title/brand/model` | `inventory_product.title/brand/model` |
| `pos_cart` | `cart` | `pos_cart` |
| `pos_cart_line` | `cart_line` | `pos_cartline` (no underscore) |
| `pos_payment` | `payment` | denormalized onto `pos_cart` |
| `temp_old_items` | `item` + `product` JOIN | — (migration staging) |
| `migrated_items` | `item.code` | `inventory_item.id` |
| `inventory_manifest_rows` | `manifest` | `inventory_manifestrow` |
| `core_user` | `auth_user` + `accounts_profile` | `accounts_user` |
| `hr_time_entry` | `timeclock_entry` | `hr_timeentry` |

# DB1 — Full Audit
## `old_production_db` — 1st Generation Dashboard

> **Audited:** 2026-03-04 (live psql queries)
> **Connection:** See [.config](.config) → `[db1]`

---

## Overview

| Property | Value |
|---|---|
| **Database name** | `old_production_db` |
| **Generation** | 1st (original system) |
| **Status** | Archive — local only, not web-accessible |
| **Framework** | Django (custom app, no DRF) with PostgreSQL |
| **Auth model** | `auth_user` (Django default) + `accounts_profile` extension |
| **Primary key style** | `char(9)` generated codes (e.g. `WTx5czCwn`) — NOT integer PKs |
| **Data since** | Feb 21, 2023 (earliest cart close) |
| **Tables** | 57 |
| **Schema detail** | [db1/schema.md](db1/schema.md) |

---

## Business Data Summary

| Metric | Value |
|---|---|
| **Total revenue (all time)** | $2,255,892.48 |
| **Completed sales (carts)** | 53,304 |
| **Total items ever** | 123,941 |
| **Total products in catalog** | 140,621 |
| **Purchase orders** | 210 |
| **Manifest rows** | 107,748 |
| **Employees** | 53 |
| **Date range** | Feb 2023 → (ongoing until v2 cutover) |
| **Payment records** | 55,176 |
| **Gift cards issued** | 31 |
| **Thrift+ members** | 5 |

---

## Table Summary

See [db1/schema.md](db1/schema.md) for full column definitions.

### Core Inventory

| Table | Rows | Description |
|---|---|---|
| `item` | 123,941 | Individual inventory items. Each has a `char(9)` code, `product_cde`, `price_lbl`, `retail_amt`, `starting_price_amt`. No title/brand — those live in `product`. |
| `product` | 140,621 | Product catalog: `title`, `brand`, `model`. Linked from `item.product_cde`. |
| `product_attrs` | 152,983 | Extended product data: UPC, category, subcategory, retail_amt. Multiple attrs per product. |
| `manifest` | 107,748 | Raw manifest rows from purchase orders. Has description, brand, model, retail_amt, `product_cde` linkage. |
| `purchase_order` | 210 | Purchase orders with cost, condition, dates, and delivery address. |

### Item Lifecycle Audit Logs

| Table | Rows | Description |
|---|---|---|
| `item_status` | 217,305 | Every status change for every item. References `list_status` for label lookup. |
| `item_condition` | 130,112 | Every condition assessment per item. References `list_condition`. |
| `item_destination` | 130,108 | Every destination assignment per item. |
| `item_dispatch` | 89,736 | Every dispatch event per item. |
| `item_location` | 0 | Item location tracking (unused/empty). |
| `item_test_result` | 0 | Test/repair value assessments (unused). |

### Pricing

| Table | Rows | Description |
|---|---|---|
| `price` | 10,816 | Week-based price ladder: item keeps a `code`, and `price` table maps `week_num` → `amount`. This is how auto-discounting worked in V1. |
| `price_index` | 234 | Price index lookup (2-char code → amount). |
| `v_price_label` | — | View: computed price label text. Not a real table. |

### POS / Sales

| Table | Rows | Description |
|---|---|---|
| `cart` | 53,304 | Sale transactions. Has subtotal, discount, tax, total, void flag. `close_time` = completion timestamp. |
| `cart_line` | 173,475 | Line items per cart: `item_cde`, `unit_price_amt`, `total_price_amt`. |
| `cart_discount` | 1,505 | Discounts applied to specific carts. |
| `payment` | 55,176 | Payment records: `type` (cash/card/giftcard), `amount`. |
| `drawer` | 918 | Cash drawer sessions. |
| `giftcard` | 31 | Gift card records with balance. |
| `thrift_plus` | 5 | Loyalty membership subscriptions. |
| `thrift_plus_payment` | 4 | Loyalty subscription payment records. |
| `discount` | 3 | Discount rule definitions. |
| `standard_bogo` | 629 | BOGO promotion definitions. |

### HR / Employees

| Table | Rows | Description |
|---|---|---|
| `employee` | 53 | Employee records with pay rate, position, type (Part-Time/Full-Time). |
| `department` | 8 | Store departments. |
| `employee_departments` | 33 | Employee–department many-to-many. |
| `employee_availability` | 18 | Availability preferences per employee. |
| `employee_compensation` | 62 | Compensation history per employee per period. |
| `timeclock` | 5,020 | Legacy time clock entries (pre-v2 timeclock). |
| `timeclock_entry` | 1,958 | Structured time entries with clock_in/out and hours. |
| `pay_period` | 240 | Payroll periods (start/end/paydate). |
| `payroll_history` | 245 | Payroll records. |
| `requests_off` | 0 | Time-off requests (unused). |
| `schedule` | 0 | Employee schedules (unused). |
| `shift` | 0 | Shift definitions (unused). |
| `ecothrift_holidays` | 93 | Store holiday calendar. |

### Lookups / Config

| Table | Rows | Description |
|---|---|---|
| `list_status` | 27 | Status label lookup (id → name). |
| `list_condition` | 7 | Condition label lookup. |
| `data_value` | 41 | General key-value config store (namespace/name/value). |
| `permissions` | 4 | App-level permissions table (emp_cde, app, func). |
| `area` | 8 | Physical area/zone definitions. |
| `address` | 3 | Address records. |
| `location` | 0 | Locations (unused). |
| `person` | 0 | Person records (unused). |

### Django System Tables

| Table | Rows | Description |
|---|---|---|
| `auth_user` | 44 | Django default user accounts. |
| `accounts_profile` | 44 | Extension of `auth_user` with email token, avatar. |
| `django_migrations` | — | Applied migrations. |
| `django_session` | — | Session store. |
| `django_content_type` | — | Content type registry. |

---

## Architecture Notes

### Identifier System
DB1 used `char(9)` random codes as primary identifiers (not integer PKs). The function `create_table_code('item')` generated these. Items are looked up by code (`item_cde`, `product_cde`, `cart_cde`, etc.), not by integer ID. This is the key difference from DB2 and DB3.

### Pricing System
Items had a `price_lbl` (code into the `price` table) defining a week-by-week discount ladder. `price.week_num` = weeks on shelf, `price.amount` = price at that week, `price.weeks_to_zero` = when it hits $0. Static items had `is_static=true` on the item.

### No SKU / No Barcode on Item
In DB1, the item itself had no barcode-scannable field. The `product_attrs.upc` was on the product level. DB2 introduced `sku` directly on `inventory_item`.

### Item Lifecycle Events
Condition, status, location, destination, and dispatch were each tracked in separate audit-log-style tables (`item_condition`, `item_status`, `item_location`, etc.) rather than direct fields on the item. DB2 simplified this into direct fields with a single `inventory_item_history` table.

### Data Volume vs DB2
DB1 has more raw data ($2.25M revenue, 123K items, 140K products) representing ~2 years of operation before v2 cutover. DB2 has $548K revenue from Aug 2025 forward.

---

## Migration / Cross-DB Relevance

- `item.code` → maps to `inventory_item.sku` (new format) via the `migrated_items` / `temp_old_items` tables in DB2
- `product.title/brand/model` → maps to `inventory_product.title/brand/model` in DB2 and DB3
- `cart` → maps to `pos_cart` in DB2/DB3
- `cart_line` → maps to `pos_cart_line` in DB2 / `pos_cartline` in DB3
- `payment.type` → maps to `pos_payment.payment_method` in DB2
- `manifest` → maps to `inventory_manifest_rows` in DB2 / `inventory_manifestrow` in DB3
- Revenue data is the most valuable ML training data for the price estimator

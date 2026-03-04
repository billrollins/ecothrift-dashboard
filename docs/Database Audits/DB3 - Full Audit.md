# DB3 — Full Audit
## `ecothrift_v2` — 3rd Generation Dashboard (This Project, Dev)

> **Audited:** 2026-03-04 (live psql queries + Django model inspection)
> **Connection:** See [.config](.config) → `[db3]`
> **Django project:** `e:\ecothrift-dashboard` (this repo)
> **`.env` setting:** `DATABASE_NAME=ecothrift_v2`
>
> **Note on naming:** This database is named `ecothrift_v2` on the local server, which conflicts with the intuitive v2→v3 naming. It is the **new, 3rd-generation** schema — not the current production v2. The naming was likely inherited from the `.env` default when the project was started.

---

## Overview

| Property | Value |
|---|---|
| **Database name** | `ecothrift_v2` |
| **Generation** | 3rd |
| **Status** | Development — will replace DB2 on Heroku |
| **Framework** | Django REST Framework + React/TypeScript frontend |
| **Auth model** | `accounts_user` (custom email-based AbstractBaseUser) |
| **Primary key style** | bigint auto-increment; `sku` varchar for items |
| **Data** | Test/dev data only (~1,149 items, 4 users) |
| **Tables** | 49 |
| **Django migrations applied** | 46 |
| **Schema detail** | [db3/schema.md](db3/schema.md) |

---

## What's New in DB3 vs DB2

DB3 represents a significant schema upgrade. Key new capabilities:

| Feature | DB2 Status | DB3 Status |
|---|---|---|
| **Consignment module** | Not present | `consignment_*` tables (3 tables) |
| **Category taxonomy** | Not present | `inventory_category` (hierarchical, `spec_template`) |
| **User roles** | Single `core_user` with flags | Split profiles: `accounts_employeeprofile`, `accounts_consigneeprofile`, `accounts_customerprofile` |
| **Batch groups** | Not present | `inventory_batchgroup` (for bulk items) |
| **Vendor product refs** | Not present | `inventory_vendorproductref` |
| **Processing batch tracking** | Partial | `inventory_processingbatch` |
| **Item fields** | `starting_price`, `disc_a`, `disc_b` | `price`, `cost`, `sold_for`, `source`, `condition` |
| **POS payment** | Separate `pos_payment` table | Denormalized onto `pos_cart` (`payment_method`, `cash_tendered`, `change_given`) |
| **HR module** | 40+ tables, 0 rows | 5 tables (simplified: `hr_timeentry`, `hr_sickleave*`, `hr_department`) |
| **Drawer handoff** | `pos_drawer_shift` | `pos_drawerhandoff` (with denomination JSON) |
| **App settings** | Not present | `core_appsetting` (JSON key-value config) |
| **Print server** | Not present | `core_printserverrelease` |

---

## Business Data Summary (Test Data)

| Metric | Value |
|---|---|
| **Items in DB** | 1,149 (test/dev) |
| **Products in catalog** | 532 |
| **Manifest rows** | 470 |
| **Batch groups** | 42 |
| **Vendor product refs** | 580 |
| **Test sales (carts)** | 10 |
| **Sale line items** | 14 |
| **Users** | 4 |
| **Consignment agreements** | 1 |
| **Purchase orders** | 1 |

---

## Table Summary

### User & Accounts

| Table | Rows | Description |
|---|---|---|
| `accounts_user` | 4 | Custom User model — email login, `is_staff`, `is_superuser`. No username required. |
| `accounts_employeeprofile` | 2 | Employee extension: `employee_number`, `position`, `pay_rate`, `hire_date`, `termination_*`, emergency contact. 1:1 with user. |
| `accounts_consigneeprofile` | 3 | Consignee extension: `consignee_number`, `commission_rate`, `payout_method`, `status`. |
| `accounts_customerprofile` | 0 | Customer extension: `customer_number`, `customer_since`. |

### Consignment (New in DB3)

| Table | Rows | Description |
|---|---|---|
| `consignment_consignmentagreement` | 1 | Agreement between store and consignee: `commission_rate`, `status`, `terms`, date range. |
| `consignment_consignmentitem` | 0 | Individual items on consignment: `asking_price`, `listed_price`, `sale_amount`, `store_commission`, `consignee_earnings`. |
| `consignment_consignmentpayout` | 0 | Payout records: `period_start/end`, `total_sales`, `payout_amount`, `status`. |

### Inventory

| Table | Rows | Description |
|---|---|---|
| `inventory_item` | 1,149 | Core item record. Fields: `sku`, `title`, `price`, `cost`, `sold_for`, `source`, `status`, `condition`, `processing_notes`, `on_shelf_at`, `sold_at`. FK to `product`, `purchase_order`, `manifest_row`, `batch_group`. |
| `inventory_itemhistory` | 1,169 | Item state change audit: every price change, status change, condition update. More records than items (many changes per item). |
| `inventory_itemscanhistory` | 0 | QR/barcode scan events (same concept as DB2's scan_history). |
| `inventory_product` | 532 | Product catalog: `title`, `brand`, `model`, `category` (text), `category_ref_id` → `inventory_category`, `default_price`, `upc`, `specifications` (jsonb). |
| `inventory_category` | 0 | **Hierarchical category taxonomy** (to be seeded). Self-referential `parent_id`. `spec_template` jsonb. |
| `inventory_batchgroup` | 42 | Groups of items from a PO treated as one batch: `unit_price`, `unit_cost`, `condition`, `location`. |
| `inventory_purchaseorder` | 1 | Full PO lifecycle: `ordered_date`, `delivered_date`, `purchase_cost`, `shipping_cost`, `fees`, `total_cost`, `retail_value`, `condition`, `manifest_preview` (jsonb). |
| `inventory_manifestrow` | 470 | Individual manifest lines with full AI matching pipeline fields: `proposed_price`, `final_price`, `ai_match_decision`, `ai_reasoning`, `ai_suggested_*`, `match_candidates` (jsonb), `specifications` (jsonb). |
| `inventory_processingbatch` | 1 | Processing batch metadata: `total_rows`, `processed_count`, `items_created`, `started_at`, `completed_at`. |
| `inventory_vendor` | 2 | Vendor records: `name`, `code`, `vendor_type`, `contact_*`, `is_active`. |
| `inventory_vendorproductref` | 580 | Cross-reference between vendors and products: `vendor_item_number`, `last_unit_cost`, `times_seen`. |
| `inventory_csvtemplate` | 2 | CSV import templates defining field mappings. |

### POS / Sales

| Table | Rows | Description |
|---|---|---|
| `pos_cart` | 10 | Sale transaction. Payment is **denormalized** onto cart: `payment_method`, `cash_tendered`, `change_given`, `card_amount`. No separate `pos_payment` table. |
| `pos_cartline` | 14 | Line items: `item_id`, `description`, `unit_price`, `line_total`. Note: table is `pos_cartline` (no underscore), not `pos_cart_line` as in DB2. |
| `pos_drawer` | 3 | Cash drawer with denomination JSON (`opening_count`, `closing_count` jsonb). |
| `pos_drawerhandoff` | 0 | Cashier handoff: `count` jsonb, `variance`. Replaces DB2's `pos_drawer_shift`. |
| `pos_cashdrop` | 0 | Safe drops from drawer: `amount` jsonb, `total`. |
| `pos_banktransaction` | 0 | Bank deposit records: `amount` jsonb, `total`, `status`. |
| `pos_receipt` | 0 | Receipt records. |
| `pos_register` | 2 | Register definitions with `starting_cash`, `starting_breakdown` jsonb. |
| `pos_revenuegoal` | 0 | Daily revenue goals per location. |
| `pos_supplementaldrawer` | 0 | Supplemental cash drawer (petty cash). |
| `pos_supplementaltransaction` | 0 | Transactions against supplemental drawer. |

### HR

| Table | Rows | Description |
|---|---|---|
| `hr_department` | 1 | Departments with `manager_id` and `location_id`. |
| `hr_timeentry` | 0 | Time entries with `clock_in/out`, `break_minutes`, `total_hours`, approval. |
| `hr_timeentrymodificationrequest` | 0 | Modification requests with `requested_clock_in/out`, `reason`, review. |
| `hr_sickleavebalance` | 1 | Sick leave balance per employee per year. |
| `hr_sickleaverequest` | 0 | Sick leave request with `hours_requested`, approval. |

### Core / Config

| Table | Rows | Description |
|---|---|---|
| `core_appsetting` | 6 | JSON key-value config store for app-wide settings. |
| `core_worklocation` | 1 | Physical work location with `timezone`. |
| `core_printserverrelease` | 0 | Print server release management with S3 file link. |
| `core_s3file` | 0 | S3 file metadata. |

---

## Django App Structure

| App | Tables | Purpose |
|---|---|---|
| `accounts` | `accounts_user`, `accounts_*profile` (3) | User management, role-based profiles |
| `consignment` | `consignment_*` (3) | Consignment item and payout management |
| `core` | `core_appsetting`, `core_worklocation`, etc. | Shared config and utilities |
| `hr` | `hr_*` (5) | Simplified HR: time tracking and sick leave |
| `inventory` | `inventory_*` (13) | Full inventory lifecycle |
| `pos` | `pos_*` (10) | POS terminal, drawers, sales |
| Django | `auth_*`, `django_*`, `token_blacklist_*` | Framework tables |

---

## Key Design Patterns

### Item Price Fields
Unlike DB2's `starting_price`/`disc_a`/`disc_b` pricing model, DB3 uses:
- `inventory_item.price` = current/active price
- `inventory_item.cost` = what the store paid
- `inventory_item.sold_for` = actual sale price

Pricing logic (discounting, express, static) is no longer stored as enum fields — it's applied via `inventory_manifestrow.final_price` → `inventory_item.price`.

### Payment Denormalization
DB3 removed the separate `pos_payment` table. Payment info lives directly on `pos_cart`:
- `payment_method` (`cash`/`card`)
- `cash_tendered`, `change_given` (for cash)
- `card_amount` (for card)

### Denomination-as-JSON
Cash counts (opening/closing drawer, handoffs, drops) are stored as jsonb `amount`/`count` fields rather than individual denomination columns. This is flexible for future denomination changes.

### Category Taxonomy
`inventory_category` supports a full hierarchy with `parent_id` self-reference and `spec_template` jsonb defining what attributes a product in this category should have. Not yet seeded (0 rows).

### Consignment Support
Brand new in DB3. A consignee has a profile (`accounts_consigneeprofile`), signs an agreement (`consignment_consignmentagreement`), brings in items (`consignment_consignmentitem` linked to `inventory_item`), and receives payouts (`consignment_consignmentpayout`).

---

## Migration Path (DB3 → Production)

When DB3 is deployed to Heroku:
1. Run `python manage.py migrate` on a fresh Heroku Postgres DB
2. Run `python manage.py seed_categories` to populate taxonomy
3. Import legacy data from DB1/DB2 via `import_legacy_data.py`
4. Update `.env` / Heroku config vars for `DATABASE_URL`
5. DB2 (`ecothrift_dev`) becomes archive (read-only)

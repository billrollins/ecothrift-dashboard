<!-- Last updated: 2026-02-18T16:00:00-06:00 -->

# Eco-Thrift Dashboard — Backend Context

## Project Structure

Django project with **7 apps** under `apps/`:

| App | Purpose |
|-----|---------|
| `apps.accounts` | Users, auth, profiles (Employee, Consignee, Customer) |
| `apps.core` | Shared models: WorkLocation, AppSetting, S3File, PrintServerRelease |
| `apps.hr` | HR: Departments, time entries, sick leave |
| `apps.inventory` | Vendors, purchase orders, products, items, processing, formula engine |
| `apps.ai` | Claude API proxy: chat endpoint, model list |
| `apps.pos` | Registers, drawers, carts, receipts, cash management |
| `apps.consignment` | Consignment agreements, items, payouts |

Root URL prefixes: `api/auth/`, `api/accounts/`, `api/core/`, `api/hr/`, `api/inventory/`, `api/ai/`, `api/pos/`, `api/consignment/`.

---

## Settings Highlights

- **Database**: PostgreSQL (`ecothrift_v2` default)
- **Auth**: `AUTH_USER_MODEL = 'accounts.User'`
- **REST Framework**:
  - `DEFAULT_AUTHENTICATION_CLASSES`: `JWTAuthentication`
  - `DEFAULT_PERMISSION_CLASSES`: `IsAuthenticated`
  - `DEFAULT_PAGINATION_CLASS`: `PageNumberPagination`, `PAGE_SIZE = 50`
  - `DEFAULT_FILTER_BACKENDS`: `DjangoFilterBackend`, `SearchFilter`, `OrderingFilter`
- **SimpleJWT**:
  - `ACCESS_TOKEN_LIFETIME`: 30 minutes
  - `REFRESH_TOKEN_LIFETIME`: 7 days
  - `ROTATE_REFRESH_TOKENS`: True
  - `BLACKLIST_AFTER_ROTATION`: True
- **Timezone**: `America/Chicago`, `USE_TZ = True`
- **CORS**: `localhost:5173`, `CORS_ALLOW_CREDENTIALS = True`
- **Static**: WhiteNoise, optional S3 for media

---

## App Models

### accounts

| Model | Key Fields |
|-------|------------|
| **User** | email (unique), first_name, last_name, phone, is_active, is_staff, date_joined, updated_at; `role` property (first group), `roles` property (all groups as list) |
| **EmployeeProfile** | user (1:1), employee_number, department (FK hr.Department), position, employment_type, pay_rate, hire_date, termination_date, **termination_type** (choices: voluntary_resignation, job_abandonment, retirement, layoff, etc.), **termination_notes**, work_location (FK core.WorkLocation) |
| **ConsigneeProfile** | user (1:1), consignee_number, commission_rate, payout_method, status (active/paused/closed), join_date |
| **CustomerProfile** | user (1:1), customer_number, customer_since |

### core

| Model | Key Fields |
|-------|------------|
| **WorkLocation** | name, address, phone, timezone (default America/Chicago), is_active |
| **AppSetting** | key, value (JSON), description, updated_by |
| **S3File** | key, filename, size, content_type, uploaded_by |
| **PrintServerRelease** | version, s3_file (FK S3File), release_notes, is_current |

### hr

| Model | Key Fields |
|-------|------------|
| **Department** | name, location (FK core.WorkLocation), manager (FK User), is_active |
| **TimeEntry** | employee (FK User), date, clock_in, clock_out, break_minutes, total_hours, status (pending/approved/flagged), approved_by |
| **SickLeaveBalance** | employee, year, hours_earned, hours_used; ANNUAL_CAP 56h |
| **SickLeaveRequest** | employee, start_date, end_date, hours_requested, status (pending/approved/denied), reviewed_by |
| **TimeEntryModificationRequest** | time_entry (FK TimeEntry), employee (FK User), requested_clock_in/out, requested_break_minutes, reason, status (pending/approved/denied), reviewed_by, review_note |

### inventory

| Model | Key Fields |
|-------|------------|
| **Vendor** | name, code (unique), vendor_type (liquidation/retail/direct/other), is_active |
| **Category** | name, slug, parent (self-FK), spec_template (JSON) |
| **PurchaseOrder** | vendor, order_number, status (ordered→paid→shipped→delivered→processing→complete), ordered_date, paid/shipped/delivered dates, manifest (FK core.S3File), manifest_preview (JSON) |
| **CSVTemplate** | vendor, name, header_signature, column_mappings (JSON), is_default |
| **ManifestRow** | purchase_order, row_number, quantity, description, title, brand, model, category, condition, retail_value, proposed_price, final_price, pricing_stage, pricing_notes, upc, vendor_item_number, batch_flag, search_tags, specifications (JSON), matched_product, matched_product_title, matched_product_number, match_status, match_candidates (JSON), ai_match_decision, ai_reasoning, ai_suggested_title, ai_suggested_brand, ai_suggested_model, notes |
| **Product** | product_number, title, brand, model, category, category_ref (FK Category), specifications (JSON), default_price, upc |
| **VendorProductRef** | vendor, product, vendor_item_number, vendor_description, last_unit_cost, times_seen, last_seen_date |
| **BatchGroup** | batch_number, product, purchase_order, manifest_row, total_qty, status, unit_price, unit_cost, condition, location, processed_by/at |
| **Item** | sku (unique), product (FK), purchase_order (FK), manifest_row (FK), batch_group (FK), processing_tier, title, price, cost, source, status, condition, location, listed_at, checked_in_at/by, sold_at |
| **ProcessingBatch** | purchase_order, status, total_rows, processed_count, items_created |
| **ItemHistory** | item, event_type, old_value, new_value, note, created_by, created_at |
| **ItemScanHistory** | item, scanned_at, ip_address, source (public_lookup/pos_terminal) |

### pos

| Model | Key Fields |
|-------|------------|
| **Register** | location (FK core.WorkLocation), name, code, starting_cash, starting_breakdown |
| **Drawer** | register, date, status (open/closed), current_cashier, opened_by, opening_count, closing_count, cash_sales_total, variance |
| **DrawerHandoff** | drawer, outgoing_cashier, incoming_cashier, counted_at, count, variance |
| **CashDrop** | drawer, amount, total, dropped_by |
| **SupplementalDrawer** | location (1:1 WorkLocation), current_balance, current_total |
| **SupplementalTransaction** | supplemental, transaction_type (draw/return/audit_adjustment), amount, related_drawer |
| **BankTransaction** | location, transaction_type (deposit/change_pickup), amount, status |
| **Cart** | drawer, cashier, customer, status (open/completed/voided), subtotal, tax_rate, tax_amount, total, payment_method |
| **CartLine** | cart, item (FK inventory.Item), description, quantity, unit_price, line_total |
| **Receipt** | cart (1:1), receipt_number, printed, emailed |
| **RevenueGoal** | location, date, goal_amount |

### consignment

| Model | Key Fields |
|-------|------------|
| **ConsignmentAgreement** | consignee (FK User), agreement_number, commission_rate, status (active/paused/closed), start_date, end_date |
| **ConsignmentItem** | agreement, item (1:1 FK inventory.Item), asking_price, listed_price, status (pending_intake→sold), received_at, listed_at, sold_at, store_commission, consignee_earnings |
| **ConsignmentPayout** | consignee, payout_number, period_start/end, items_sold, total_sales, total_commission, payout_amount, status (pending/paid), payment_method |

---

## App Relationships

```
User (accounts)
  ├── EmployeeProfile → hr.Department, core.WorkLocation
  ├── ConsigneeProfile
  └── CustomerProfile

core.WorkLocation
  ├── hr.Department
  ├── pos.Register
  ├── pos.SupplementalDrawer (1:1)
  └── pos.BankTransaction, pos.RevenueGoal

inventory.PurchaseOrder → inventory.Vendor, core.S3File
inventory.ManifestRow → inventory.PurchaseOrder
inventory.Product → inventory.Category (optional)
inventory.VendorProductRef → inventory.Vendor, inventory.Product
inventory.BatchGroup → inventory.Product, inventory.PurchaseOrder, inventory.ManifestRow
inventory.Item → inventory.Product, inventory.PurchaseOrder, inventory.ManifestRow, inventory.BatchGroup
inventory.ProcessingBatch → inventory.PurchaseOrder
inventory.ItemHistory, inventory.ItemScanHistory → inventory.Item

pos.Drawer → pos.Register, User
pos.Cart → pos.Drawer, User, inventory.Item (via CartLine)
pos.Receipt → pos.Cart

consignment.ConsignmentAgreement → User (consignee)
consignment.ConsignmentItem → ConsignmentAgreement, inventory.Item (1:1)
consignment.ConsignmentPayout → User (consignee)
```

---

## Key Patterns

### ViewSets + DRF Routers

- Each app uses `DefaultRouter` and `router.register()` for CRUD endpoints.
- Example: `api/pos/drawers/`, `api/pos/drawers/<id>/`, etc.

### Custom Endpoints

- **`@action(detail=True, methods=['patch'])`** on ViewSets for sub-resource updates (e.g. `users/<id>/employee_profile/`).
- **Function-based views** for non-CRUD endpoints (e.g. `dashboard/metrics/`, `my/items/`, `my/payouts/`, `my/summary/`).

### Permission Classes

- Default: `IsAuthenticated`.
- Custom: `IsAdmin`, `IsManager`, `IsManagerOrAdmin`, `IsEmployee`, `IsConsignee`, `IsStaff`.
- Applied per ViewSet or view via `permission_classes`.

### Timestamps

- All `created_at` / `updated_at` use `auto_now_add` / `auto_now`; stored in `America/Chicago` (USE_TZ=True).

---

## Inventory Backend Updates (Post-1.4.0 UX Pass)

- Added guarded order reset workflow on `PurchaseOrderViewSet`:
  - `GET /api/inventory/orders/:id/delete-preview/`
  - `POST /api/inventory/orders/:id/purge-delete/` (requires `confirm_order_number`)
- Purge flow deletes order-owned artifacts in reverse operational sequence:
  1) `ItemHistory`, 2) `ItemScanHistory`, 3) `Item`,
  4) `BatchGroup`, 5) `ProcessingBatch`, 6) `ManifestRow`,
  7) manifest `S3File` (only if not referenced by another order), 8) `PurchaseOrder`.
- Shared catalog entities are intentionally retained during purge:
  - `Product`
  - `VendorProductRef`
  - `CSVTemplate`
- Enhanced preprocessing preview endpoints for full-dataset search + capped preview result windows:
  - `GET /api/inventory/orders/:id/manifest-rows/?search=...&limit=100`
    - searches full raw manifest rows server-side,
    - returns top N rows and `row_count_filtered`.
  - `POST /api/inventory/orders/:id/preview-standardize/` with `search_term`
    - filters full normalized row set server-side,
    - returns top preview rows with filtered count metadata.

---

## AI App (`apps/ai/`) — Added v1.6.0

- **`GET /api/ai/models/`** — Returns curated list of available Claude models (`claude-sonnet-4-6`, `claude-haiku-4-5`)
- **`POST /api/ai/chat/`** — Proxies to Anthropic Claude API. Accepts `model`, `system`, `messages`, `max_tokens`.
- `anthropic` library is lazy-imported to prevent startup crash if not installed.
- `ANTHROPIC_API_KEY` loaded from Django settings / `.env`.

## Inventory AI Endpoints — Added v1.6.0

- **`POST /api/inventory/orders/:id/ai-cleanup-rows/`** — Sends manifest rows to Claude in batches for title/brand/model/specs cleanup. Accepts `model`, `batch_size`, `offset`. Returns `{ rows_processed, total_rows, offset, suggestions, model_used, has_more }`.
- **`GET /api/inventory/orders/:id/ai-cleanup-status/`** — Returns `{ total_rows, cleaned_rows, remaining_rows }`.
- **`POST /api/inventory/orders/:id/cancel-ai-cleanup/`** — Clears all AI-generated fields on manifest rows.
- **`POST /api/inventory/orders/:id/suggest-formulas/`** — AI suggests expression formulas for standard fields given manifest headers and sample data.
- **`POST /api/inventory/orders/:id/match-products/`** — Fuzzy scoring (UPC, VendorRef, text similarity) + AI batch decisions.
- **`POST /api/inventory/orders/:id/review-matches/`** — User submits accept/reject/modify decisions for match results.
- **`GET /api/inventory/orders/:id/match-results/`** — Returns all rows with candidates, AI decisions, scores.

## Expression Formula Engine (`apps/inventory/formula_engine.py`) — Added v1.6.0

- Tokenizer + recursive descent parser + AST evaluator
- Column refs: `[COLUMN_NAME]`, Functions: `UPPER()`, `LOWER()`, `TITLE()`, `TRIM()`, `REPLACE()`, `CONCAT()`, `LEFT()`, `RIGHT()`
- String concatenation with `+`, quoted string literals
- `evaluate_formula(formula_str, row_dict) -> str` public entry point
- `normalize_row()` in views.py checks for `formula` key (new path) vs `source` + `transforms` (legacy path)

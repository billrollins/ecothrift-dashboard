<!-- Last updated: 2026-02-13T10:53:00-06:00 -->

# Eco-Thrift Dashboard — Backend Context

## Project Structure

Django project with **6 apps** under `apps/`:

| App | Purpose |
|-----|---------|
| `apps.accounts` | Users, auth, profiles (Employee, Consignee, Customer) |
| `apps.core` | Shared models: WorkLocation, AppSetting, S3File, PrintServerRelease |
| `apps.hr` | HR: Departments, time entries, sick leave |
| `apps.inventory` | Vendors, purchase orders, products, items, processing |
| `apps.pos` | Registers, drawers, carts, receipts, cash management |
| `apps.consignment` | Consignment agreements, items, payouts |

Root URL prefixes: `api/auth/`, `api/accounts/`, `api/core/`, `api/hr/`, `api/inventory/`, `api/pos/`, `api/consignment/`.

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
| **User** | email (unique), first_name, last_name, phone, is_active, is_staff, date_joined, updated_at; `role` property from groups |
| **EmployeeProfile** | user (1:1), employee_number, department (FK hr.Department), position, employment_type, pay_rate, hire_date, termination_date, work_location (FK core.WorkLocation) |
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

### inventory

| Model | Key Fields |
|-------|------------|
| **Vendor** | name, code (unique), vendor_type (liquidation/retail/direct/other), is_active |
| **PurchaseOrder** | vendor, order_number, status (ordered→complete), ordered_date, manifest (FK core.S3File) |
| **CSVTemplate** | vendor, name, header_signature, column_mappings (JSON), is_default |
| **ManifestRow** | purchase_order, row_number, quantity, description, brand, model, category, retail_value, upc |
| **Product** | title, brand, model, category, description, default_price |
| **Item** | sku (unique), product (FK), purchase_order (FK), title, price, cost, source (purchased/consignment/house), status (intake→sold), location, listed_at, sold_at, sold_for |
| **ProcessingBatch** | purchase_order, status, total_rows, processed_count, items_created |
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
inventory.Item → inventory.Product, inventory.PurchaseOrder
inventory.ManifestRow → inventory.PurchaseOrder
inventory.ProcessingBatch → inventory.PurchaseOrder

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

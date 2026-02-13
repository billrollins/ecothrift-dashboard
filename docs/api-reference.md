<!-- Last updated: 2026-02-13T16:00:00-06:00 -->
# API Reference

Base URL: `/api`

All endpoints return JSON. Authenticated endpoints require `Authorization: Bearer <token>`. Refresh token is sent via httpOnly cookie.

Paginated list endpoints return: `{ count, next, previous, results: [...] }`

---

## Auth (`/api/auth/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login/` | No | Returns `{ access, user }`. Sets refresh cookie. |
| POST | `/auth/refresh/` | Cookie | Returns `{ access }`. Reads refresh from httpOnly cookie. |
| POST | `/auth/logout/` | No | Blacklists refresh token, clears cookie. |
| GET | `/auth/me/` | Yes | Returns current user with profiles. |
| POST | `/auth/change-password/` | Yes | Body: `{ old_password, new_password }` |
| POST | `/auth/forgot-password/` | No | Request password reset. Body: `{ email }`. Returns `{ detail, reset_token }` (token stubbed in response for dev). |
| POST | `/auth/reset-password/` | No | Reset password with token. Body: `{ token, new_password }`. |

---

## Users (`/api/accounts/`)

**Permission:** Admin only

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/accounts/users/` | List users. Filter: `?role=`, `?is_active=`, `?search=` |
| POST | `/accounts/users/` | Create user with role and profile. |
| GET | `/accounts/users/:id/` | Get user detail. |
| PATCH | `/accounts/users/:id/` | Update user. |
| PATCH | `/accounts/users/:id/employee_profile/` | Update employee profile. |
| PATCH | `/accounts/users/:id/consignee_profile/` | Update consignee profile. |
| POST | `/accounts/users/:id/reset-password/` | Admin reset: generates temporary password. Returns `{ detail, temporary_password }`. |

### Customers

**Permission:** Manager+

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/accounts/customers/` | List customers. Filter: `?search=` |
| POST | `/accounts/customers/` | Create customer with profile. |
| GET | `/accounts/customers/:id/` | Get customer detail. |
| PATCH | `/accounts/customers/:id/` | Update customer. |
| DELETE | `/accounts/customers/:id/` | Delete customer. |
| GET | `/accounts/customers/lookup/:customer_number/` | POS lookup by customer number (e.g. `CUS-001`). |

---

## Core (`/api/core/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/core/locations/` | Staff | List work locations. |
| CRUD | `/core/settings/` | Manager+ | App settings (lookup by `key`). |
| CRUD | `/core/files/` | Manager+ | S3 file records. |
| GET | `/core/system/print-server-version/` | Yes | Current print server release. |
| GET | `/core/system/print-server-releases/` | Yes | All print server releases. |

---

## HR (`/api/hr/`)

### Time Entries

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/hr/time-entries/` | Employee+ | List entries. Filter: `?employee=`, `?date=`, `?status=`, `?date_from=`, `?date_to=` |
| POST | `/hr/time-entries/` | Employee+ | Clock in. Empty body OK — auto-fills employee, date, clock_in. |
| GET | `/hr/time-entries/current/` | Employee+ | Get active (clocked-in) entry for current user. |
| POST | `/hr/time-entries/:id/clock_out/` | Employee+ | Clock out. Body: `{ break_minutes }` |
| POST | `/hr/time-entries/:id/approve/` | Manager+ | Approve entry. Triggers sick leave accrual. |
| POST | `/hr/time-entries/bulk_approve/` | Manager+ | Body: `{ ids: [1,2,3] }` |
| GET | `/hr/time-entries/summary/` | Employee+ | Aggregated hours for current filters. |

### Departments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/hr/departments/` | Staff (write: Manager+) | Department management. |

### Sick Leave

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/hr/sick-leave/balances/` | Employee+ | Filter: `?employee=`, `?year=` |
| CRUD | `/hr/sick-leave/requests/` | Employee+ | Filter: `?employee=`, `?status=` |
| POST | `/hr/sick-leave/requests/:id/approve/` | Manager+ | Approve and deduct hours. |
| POST | `/hr/sick-leave/requests/:id/deny/` | Manager+ | Deny request. |

### Time Entry Modification Requests

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/hr/modification-requests/` | Employee+ | List requests. Filter: `?employee=`, `?status=` |
| POST | `/hr/modification-requests/` | Employee+ | Submit modification request. |
| POST | `/hr/modification-requests/:id/approve/` | Manager+ | Approve and apply changes to the time entry. |
| POST | `/hr/modification-requests/:id/deny/` | Manager+ | Deny with review note. |

---

## Inventory (`/api/inventory/`)

### Vendors

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/vendors/` | Staff | Soft delete via `is_active`. |

### Purchase Orders

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/orders/` | Staff | Filter: `?vendor=`, `?status=` |
| POST | `/inventory/orders/:id/deliver/` | Staff | Mark as delivered. |
| POST | `/inventory/orders/:id/upload-manifest/` | Staff | Upload CSV manifest file. |
| POST | `/inventory/orders/:id/process-manifest/` | Staff | Parse CSV into ManifestRows. |
| POST | `/inventory/orders/:id/create-items/` | Staff | Create Items from ManifestRows. |

### Products & Items

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/products/` | Staff | Reusable product definitions. |
| CRUD | `/inventory/items/` | Staff | Filter: `?status=`, `?source=`, `?category=` |
| POST | `/inventory/items/:id/ready/` | Staff | Mark item as on_shelf. |
| GET | `/inventory/items/lookup/:sku/` | **Public** | Public item lookup by SKU. |

### CSV Templates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/templates/` | Staff | Vendor CSV column mappings. |

---

## POS (`/api/pos/`)

### Registers & Drawers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/pos/registers/` | Staff | Register configuration. |
| GET | `/pos/drawers/` | Employee+ | Filter: `?register=`, `?date=`, `?status=` |
| POST | `/pos/drawers/` | Employee+ | Open a drawer. |
| POST | `/pos/drawers/:id/close/` | Employee+ | Close with closing count. |
| POST | `/pos/drawers/:id/handoff/` | Employee+ | Mid-shift cashier handoff. |
| POST | `/pos/drawers/:id/drop/` | Employee+ | Cash drop to safe. |

### Carts (Sales)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/pos/carts/` | Employee+ | Create cart for a drawer. |
| POST | `/pos/carts/:id/add-item/` | Employee+ | Add item by SKU. Body: `{ sku }` |
| DELETE | `/pos/carts/:id/lines/:line_id/` | Employee+ | Remove a line. |
| POST | `/pos/carts/:id/complete/` | Employee+ | Complete sale. Body: `{ payment_method, cash_tendered?, card_amount? }` |
| POST | `/pos/carts/:id/void/` | Manager+ | Void a completed cart. Reverts items to on_shelf. |

### Cash Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/pos/supplemental/` | Manager+ | Get supplemental drawer status. |
| POST | `/pos/supplemental/draw/` | Manager+ | Draw cash from supplemental. |
| POST | `/pos/supplemental/return/` | Manager+ | Return cash to supplemental. |
| POST | `/pos/supplemental/audit/` | Manager+ | Audit count with variance. |
| GET | `/pos/supplemental/transactions/` | Manager+ | Recent supplemental transactions. |
| CRUD | `/pos/bank-transactions/` | Manager+ | Bank deposits and change pickups. |
| PATCH | `/pos/bank-transactions/:id/complete/` | Manager+ | Mark bank transaction complete. |

### Receipts & Goals

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/pos/receipts/` | Employee+ | Lookup by `receipt_number`. |
| CRUD | `/pos/revenue-goals/` | Manager+ | Daily revenue goals. |

### Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/pos/dashboard/metrics/` | Yes | Today's revenue, weekly chart, 4-week comparison, quick stats. |
| GET | `/pos/dashboard/alerts/` | Yes | Pending approvals, open drawers, etc. |

---

## Consignment (`/api/consignment/`)

### Consignee Accounts

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/consignment/accounts/` | Manager+ | List consignee accounts (ConsigneeProfiles). Filter: `?search=` |
| POST | `/consignment/accounts/` | Manager+ | Create consignee account. Body: `{ user_id }` (existing user) or `{ first_name, last_name, email, phone }` (new user). |
| GET | `/consignment/accounts/:id/` | Manager+ | Get consignee account detail. Lookup by user ID. |
| PATCH | `/consignment/accounts/:id/` | Manager+ | Update consignee profile fields. |
| DELETE | `/consignment/accounts/:id/` | Manager+ | Soft delete (sets status to `closed`). |

### Staff Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/consignment/agreements/` | Manager+ | Filter: `?consignee=`, `?status=` |
| CRUD | `/consignment/items/` | Staff | Filter: `?agreement=`, `?agreement__consignee=`, `?status=` |
| CRUD | `/consignment/payouts/` | Manager+ | Filter: `?consignee=`, `?status=` |
| POST | `/consignment/payouts/generate/` | Manager+ | Auto-generate payout for a period. |
| PATCH | `/consignment/payouts/:id/pay/` | Manager+ | Mark payout as paid. |

### Consignee Portal

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/consignment/my/items/` | Consignee | Own consignment items. |
| GET | `/consignment/my/payouts/` | Consignee | Own payouts. |
| GET | `/consignment/my/summary/` | Consignee | Dashboard summary stats. |

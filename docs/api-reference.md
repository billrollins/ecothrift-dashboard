<!-- Last updated: 2026-03-04T14:00:00-06:00 -->
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
| GET | `/core/system/version/` | Yes | App version/build metadata from `.ai/version.json`. |
| GET | `/core/system/print-server-version/` | Yes | Current print server release. |
| GET | `/core/system/print-server-releases/` | Yes | All print server releases. |
| GET | `/core/system/print-server-version-public/` | No | Public (no auth) — current print server version for the `/manage` update-check page. Returns `{ available, version, download_url, ... }` or `{ available: false }`. |

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

**M3 note:** Inventory processing uses Universal Items + Smart Batch. All physical units become `Item` records; batch APIs accelerate processing actions over those items.

### Vendors

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/vendors/` | Staff | Soft delete via `is_active`. |

### Purchase Orders

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/orders/` | Staff | Filter: `?vendor=`, `?status=`. Order # auto-generated or user-provided. |
| POST | `/inventory/orders/:id/mark-paid/` | Staff | Set status=paid, paid_date. |
| POST | `/inventory/orders/:id/revert-paid/` | Staff | Revert to ordered, clear paid_date. |
| POST | `/inventory/orders/:id/mark-shipped/` | Staff | Set status=shipped, shipped_date, expected_delivery. |
| POST | `/inventory/orders/:id/revert-shipped/` | Staff | Revert to paid/ordered, clear shipped_date. |
| POST | `/inventory/orders/:id/deliver/` | Staff | Set status=delivered, delivered_date. |
| POST | `/inventory/orders/:id/revert-delivered/` | Staff | Revert to paid (or ordered), clear delivered_date. |
| POST | `/inventory/orders/:id/upload-manifest/` | Staff | Upload CSV to S3, persist preview. Returns full order. |
| GET | `/inventory/orders/:id/manifest-rows/` | Staff | Return parsed raw manifest rows plus template mappings, standard columns, and available functions. Supports `?search=` (full-row match) and returns top rows by `?limit=`. |
| POST | `/inventory/orders/:id/preview-standardize/` | Staff | Validate and preview Standard Manifest normalization without writing `ManifestRow` rows. Supports `search_term` over full normalized output before applying preview limit. |
| POST | `/inventory/orders/:id/process-manifest/` | Staff | Standardize manifest rows into `ManifestRow` using standard mappings + function chains; optional template save by header signature. |
| POST | `/inventory/orders/:id/update-manifest-pricing/` | Staff | Bulk update pre-arrival pricing fields on standardized manifest rows. |
| POST | `/inventory/orders/:id/suggest-formulas/` | Staff | AI-suggest formula mappings for standard columns based on manifest headers. |
| POST | `/inventory/orders/:id/ai-cleanup-rows/` | Staff | Send manifest rows to Claude in batches for AI title/brand/model/specs cleanup. Supports `batch_size` and `offset`. |
| GET | `/inventory/orders/:id/ai-cleanup-status/` | Staff | Returns cleanup progress: `cleaned_rows`, `total_rows`. |
| POST | `/inventory/orders/:id/cancel-ai-cleanup/` | Staff | Undo Step 2: clears all AI fields. Cascades to also clear Step 3 matching fields. |
| POST | `/inventory/orders/:id/clear-manifest-rows/` | Staff | Undo Step 1: deletes all ManifestRow records. Blocked if Items exist. |
| POST | `/inventory/orders/:id/undo-product-matching/` | Staff | Undo Step 3: clears match_candidates, ai_match_decision, matched_product on all rows. |
| POST | `/inventory/orders/:id/clear-pricing/` | Staff | Undo Step 4: clears proposed_price, final_price, resets pricing_stage to 'unpriced'. |
| POST | `/inventory/orders/:id/match-products/` | Staff | Match manifest rows to Products (UPC/vendor ref/fallback text). |
| GET | `/inventory/orders/:id/match-results/` | Staff | Returns match results with summary and per-row candidates/decisions. |
| POST | `/inventory/orders/:id/review-matches/` | Staff | Submit review decisions (accept/reject/update) for matched manifest rows. |
| POST | `/inventory/orders/:id/finalize-rows/` | Staff | Finalize manifest rows with edited fields and set pricing_stage to 'final'. |
| POST | `/inventory/orders/:id/create-items/` | Staff | Build check-in queue: create `Item` rows and batch groups from manifest rows. Also auto-triggered by deliver. |
| POST | `/inventory/orders/:id/check-in-items/` | Staff | Bulk check in selected order items and mark them shelf-ready. Body: `item_ids`, `condition`, `location`, `price`, etc. |
| POST | `/inventory/orders/:id/mark-items-broken/` | Staff | Bulk mark items as scrapped. Body: `{ item_ids: [...] }` |
| POST | `/inventory/orders/:id/uncheck-in-items/` | Staff | Bulk revert items to intake. Body: `{ item_ids: [...] }` |
| POST | `/inventory/orders/:id/mark-complete/` | Staff | Mark order complete when no intake items remain. |
| GET | `/inventory/orders/:id/delete-preview/` | Staff | Preview reverse-sequence deletion plan and impacted artifacts/items for safe order reset. |
| POST | `/inventory/orders/:id/purge-delete/` | Staff | Purge order-owned artifacts in reverse order, then delete the order. Requires `confirm_order_number`. |

### Batch Groups (M3)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/inventory/batch-groups/` | Staff | List/filter batch groups (`status`, `purchase_order`, `product`). |
| GET | `/inventory/batch-groups/:id/` | Staff | Batch group detail with processing metadata. |
| POST | `/inventory/batch-groups/:id/process/` | Staff | Apply price/condition/location to all grouped items and mark batch complete. |
| POST | `/inventory/batch-groups/:id/check-in/` | Staff | Check in pending batch items and mark shelf-ready. Optional body: `check_in_count`, `scrap_count` for partial check-in. |
| POST | `/inventory/batch-groups/:id/detach/` | Staff | Detach one item from batch into individual processing flow. |

### Vendor Product Refs (M3)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/product-refs/` | Staff | Vendor-to-product cross references; filter by `vendor`, `product`, search by vendor item #. |

### Categories (M3)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/categories/` | Staff | Category taxonomy and optional spec templates. |

### Products & Items

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/products/` | Staff | Product catalog with M3 matching metadata. |
| CRUD | `/inventory/items/` | Staff | Filter: `?status=`, `?source=`, `?category=`, `?processing_tier=`, `?batch_group=`, `?condition=` |
| POST | `/inventory/items/:id/check-in/` | Staff | Check in a single item with finalized fields and mark shelf-ready. |
| POST | `/inventory/items/:id/mark-broken/` | Staff | Mark item as scrapped. |
| POST | `/inventory/items/:id/uncheck-in/` | Staff | Revert item to intake (clear checked_in_at, listed_at). |
| POST | `/inventory/items/:id/ready/` | Staff | Mark item as on_shelf. |
| GET | `/inventory/items/lookup/:sku/` | **Public** | Public item lookup by SKU. |

### Item History (M3)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/inventory/item-history/` | Staff | Read-only lifecycle events. Filter: `?item=`, `?event_type=` |

### CSV Templates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/inventory/templates/` | Staff | Vendor CSV mappings keyed by header signature for preprocessing reuse. |

### Retag v2 (Temporary Scaffolding)

> Temporary endpoints for the DB2→DB3 retag workflow. Remove after retag day.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/inventory/retag/v2/lookup/` | Staff | Look up a DB2 item by SKU. Body: `{ sku }`. Returns `TempLegacyItem` data + `retag_count`. |
| POST | `/inventory/retag/v2/create/` | Staff | Create a new DB3 `Item` from a legacy SKU. Body: `{ legacy_sku, title, brand, price, retail_amt, condition, source }`. Always creates a new item even if previously retagged. Returns `print_payload`. |
| GET | `/inventory/retag/v2/stats/` | Staff | Summary stats: `total_retagged`, `sum_price`, `sum_retail`. |
| GET | `/inventory/retag/v2/history/` | Staff | Paginated `RetagLog` rows. Query: `?search=`, `?since=` (ISO datetime), `?page=`, `?page_size=`. Response includes summary stats. |

---

## POS (`/api/pos/`)

### Registers & Drawers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| CRUD | `/pos/registers/` | Staff | Register configuration. |
| GET | `/pos/drawers/` | Employee+ | Filter: `?register=`, `?date=`, `?status=` |
| POST | `/pos/drawers/` | Employee+ | Open a drawer. Body: `{ register, opening_count, opening_total }` |
| POST | `/pos/drawers/:id/close/` | Employee+ | Close with closing count. Expected cash = opening + sales − drops. |
| POST | `/pos/drawers/:id/handoff/` | Employee+ | Mid-shift cashier handoff (outgoing cashier initiates with count). |
| POST | `/pos/drawers/:id/takeover/` | Employee+ | Takeover: incoming cashier claims drawer. Body optional: `{ count?, counted_total?, notes? }`. Defaults counted_total to expected cash if omitted. |
| POST | `/pos/drawers/:id/reopen/` | Manager+ | Reopen a closed drawer. Body optional: `{ cashier? }` to reassign. |
| POST | `/pos/drawers/:id/drop/` | Employee+ | Cash drop to safe. |

### Carts (Sales)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/pos/carts/` | Employee+ | List carts. Filter: `?status=`, `?cashier=`, `?payment_method=`, `?receipt_number=`, `?date_from=`, `?date_to=`. Status: `open`, `completed`, `voided`, or `all` (completed + voided). |
| POST | `/pos/carts/` | Employee+ | Create cart for a drawer. Drawer must be `open`. `cashier` set server-side. |
| POST | `/pos/carts/:id/add-item/` | Employee+ | Add item by SKU. Body: `{ sku }`. Increments qty on existing line if same item already in cart. |
| PATCH | `/pos/carts/:id/lines/:line_id/` | Employee+ | Update a line. Body: `{ quantity?, description?, unit_price? }` |
| DELETE | `/pos/carts/:id/lines/:line_id/` | Employee+ | Remove a line. |
| POST | `/pos/carts/:id/complete/` | Employee+ | Complete sale. Body: `{ payment_method, cash_tendered?, card_amount? }` |
| POST | `/pos/carts/:id/void/` | Manager+ | Void a cart. Reverts items to on_shelf. |

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

## AI (`/api/ai/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/ai/chat/` | Staff | Proxy to Anthropic Claude API. Body: `{ model, messages, max_tokens, system }`. |
| GET | `/ai/models/` | Staff | List available Claude models with display names and capabilities. |

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

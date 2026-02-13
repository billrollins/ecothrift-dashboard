<!-- Last updated: 2026-02-13T16:00:00-06:00 -->

# Consignment — Extended Context

This document describes the consignment system, models, API, and consignee portal for the Eco-Thrift Dashboard.

---

## Overview

Consignment allows external consignees (Users with consignee role) to place items in the store. The store sells items and pays consignees their share based on commission terms. Commission is calculated when items are sold (e.g. via POS); payouts aggregate sold items for a period.

---

## ConsigneeAccount (ConsigneeProfile)

A consignee account is a `ConsigneeProfile` linked 1:1 to a `User`. Managed via `ConsigneeAccountViewSet`.

- **Create**: Can link an existing user (`user_id`) or create a new user (`first_name`, `last_name`, `email`, `phone`). Adding the `Consignee` group does NOT remove existing groups (supports multi-role users).
- **Lookup**: Uses `user__id` as the lookup field (not profile ID).
- **Soft delete**: Sets `status='closed'` instead of actual deletion.
- **Default fields**: `commission_rate`, `payout_method`, `notes`.

**API**: `/consignment/accounts/` — CRUD; search by name, email, phone, consignee_number.

**Frontend**: `AccountsPage` lists consignee accounts (people). Row click navigates to `ConsigneeDetailPage` (`/consignment/accounts/:id`).

---

## ConsignmentAgreement

Ties a consignee (User) to commission terms. Each agreement represents a single drop-off batch of items.

- **`consignee`** — FK to `AUTH_USER_MODEL`
- **`agreement_number`** — Unique, auto-generated (e.g. `AGR-001`)
- **`commission_rate`** — Store's cut as % (e.g. 40.00 = store keeps 40%, consignee gets 60%)
- **`status`**: `active`, `paused`, `closed`
- **`start_date`**, **`end_date`** (optional), **`terms`**

**Permissions**: `IsManagerOrAdmin` — managers/admins manage agreements.

**API**: `/consignment/agreements/` — CRUD; filter by `consignee`, `status`.

---

## ConsignmentItem

Links an inventory Item to a consignment agreement; tracks pricing and earnings.

- **`agreement`** — FK to ConsignmentAgreement
- **`item`** — OneToOneField to `inventory.Item` (related_name `consignment`)
- **`asking_price`** — Consignee's requested price
- **`listed_price`** — Price when listed for sale
- **`status`**: `pending_intake`, `listed`, `sold`, `expired`, `returned`
- **`received_at`**, **`listed_at`**, **`sold_at`**
- **`sale_amount`** — Actual sale price
- **`store_commission`** — Store's share
- **`consignee_earnings`** — Consignee's share
- **`return_date`**, **`notes`**

**Sale flow**: When a consignment item is sold through the POS, `Cart.complete` (or equivalent) should set `sale_amount`, `store_commission`, and `consignee_earnings` on the ConsignmentItem, and update the linked Item's `sold_at`, `sold_for`, `status='sold'`. Commission is computed from the agreement's `commission_rate`.

**Permissions**: `IsStaff` — staff manage consignment items.

**API**: `/consignment/items/` — CRUD; filter by `agreement`, `agreement__consignee`, `status`.

---

## ConsignmentPayout

Generated for a period; aggregates sold consignment items and tracks payment.

- **`consignee`** — FK to User
- **`payout_number`** — Unique, auto-generated (e.g. `PAY-001`)
- **`period_start`**, **`period_end`** — Date range
- **`items_sold`** — Count of sold items in period
- **`total_sales`** — Sum of sale_amount
- **`total_commission`** — Sum of store_commission
- **`payout_amount`** — Sum of consignee_earnings (what consignee receives)
- **`status`**: `pending`, `paid`
- **`paid_at`**, **`paid_by`**, **`payment_method`** (`cash`, `check`, `store_credit`), **`notes`**

**Permissions**: `IsManagerOrAdmin` — managers/admins manage payouts.

**API**: `/consignment/payouts/` — CRUD; filter by `consignee`, `status`.

---

## Payout Generation Flow

**Endpoint**: `POST /consignment/payouts/generate/`

**Request body**:
```json
{
  "consignee": <user_id>,
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD"
}
```

**Logic**:
1. Find `ConsignmentItem` where `agreement__consignee_id=consignee`, `status='sold'`, `sold_at` in period, `sale_amount` not null.
2. Aggregate: `total_sales`, `total_commission`, `total_earnings` (consignee_earnings).
3. Create `ConsignmentPayout` with `payout_amount = total_earnings`.
4. Return created payout (201).

**Note**: The current implementation does not mark items as "paid out" to prevent double-payout; payouts are generated per period and may overlap if run multiple times. Consider adding a `payout` FK to ConsignmentItem or a "paid" flag if double-payout prevention is required.

---

## Mark Payout Paid

**Endpoint**: `PATCH /consignment/payouts/{id}/pay/`

Sets `status='paid'`, `paid_at=now`, `paid_by=request.user`; optionally updates `payment_method`, `notes`.

---

## Consignee Portal

Separate layout and routes for consignees (`role='Consignee'`).

### Layout

**Component**: `ConsigneeLayout.tsx` — AppBar with logo, nav (My Items, My Payouts, Summary), Logout. Renders `<Outlet />` for child routes.

### Routes

| Path              | Page             | Description                    |
|-------------------|------------------|--------------------------------|
| `/consignee`      | SummaryPage      | Aggregate stats                |
| `/consignee/items`| MyItemsPage      | Consignee's items              |
| `/consignee/payouts` | MyPayoutsPage | Consignee's payouts            |

**Routing**: Consignees are redirected to `/consignee` on login. Routes are under a parent that uses `ConsigneeLayout`.

---

## My Summary Endpoint

**Endpoint**: `GET /consignment/my/summary/`

**Permission**: `IsConsignee` — consignee sees only their own data.

**Response**:
```json
{
  "total_items": <int>,
  "listed_count": <int>,
  "sold_count": <int>,
  "total_earned": "<decimal string>",
  "pending_balance": "<decimal string>"
}
```

- **`total_items`** — All consignment items for the consignee
- **`listed_count`** — Items with `status='listed'`
- **`sold_count`** — Items with `status='sold'`
- **`total_earned`** — Sum of `consignee_earnings` for sold items
- **`pending_balance`** — `total_earned` minus sum of `payout_amount` for paid payouts

**Frontend**: `SummaryPage` displays cards for Total Items, Currently Listed, Sold, Total Earned, Pending Balance. (Note: `SummaryPage` uses `currently_listed` in its type; API returns `listed_count`.)

---

## My Items Endpoint

**Endpoint**: `GET /consignment/my/items/`

**Permission**: `IsConsignee`

Returns list of consignment items for the current user (via `agreement__consignee=request.user`). Serializer: `MyConsignmentItemSerializer` (includes `item_sku`, `item_title`, etc.).

**Frontend**: `MyItemsPage` — DataGrid with SKU, Title, Price, Status, Sale Amount, My Earnings.

---

## My Payouts Endpoint

**Endpoint**: `GET /consignment/my/payouts/`

**Permission**: `IsConsignee`

Returns payouts for the current user. Serializer: `MyConsignmentPayoutSerializer`.

**Frontend**: `MyPayoutsPage` — DataGrid with Payout #, Period, Items Sold, Payout Amount, Status, Paid Date.

---

## Permission Model

| Resource            | Staff | Manager/Admin | Consignee        |
|---------------------|-------|---------------|------------------|
| Agreements          | —     | CRUD          | —                |
| Consignment Items   | CRUD  | —             | —                |
| Payouts             | —     | CRUD, generate| —                |
| My Items            | —     | —             | Read (own)       |
| My Payouts          | —     | —             | Read (own)       |
| My Summary          | —     | —             | Read (own)       |

- **IsStaff**: Staff can manage consignment items.
- **IsManagerOrAdmin**: Managers/admins manage agreements and payouts.
- **IsConsignee**: Consignees access `/consignment/my/*` endpoints only.

---

## URL Structure

```
/consignment/
  accounts/            — ConsigneeAccountViewSet (ConsigneeProfile CRUD)
  agreements/          — ConsignmentAgreementViewSet
  items/               — ConsignmentItemViewSet
  payouts/             — ConsignmentPayoutViewSet
    generate/          — POST (action)
    {id}/pay/          — PATCH (action)
  my/items/            — my_items
  my/payouts/          — my_payouts
  my/summary/          — my_summary
```

---

## Frontend Hooks & API

**Hooks** (`useConsignment.ts`):
- `useConsigneeAccounts`, `useConsigneeAccount`, `useCreateConsigneeAccount`, `useUpdateConsigneeAccount`, `useDeleteConsigneeAccount`
- `useAgreements`, `useCreateAgreement`, `useUpdateAgreement`, `useDeleteAgreement`
- `useConsignmentItems`
- `usePayouts`, `useGeneratePayout`, `useMarkPayoutPaid`
- `useMyItems`, `useMyPayouts`, `useMySummary`

**API** (`consignment.api.ts`):
- `getConsigneeAccounts()`, `getConsigneeAccount(id)`, `createConsigneeAccount(data)`, `updateConsigneeAccount(id, data)`, `deleteConsigneeAccount(id)`
- `generatePayout(data)` → `POST /consignment/payouts/generate/`
- `markPayoutPaid(id, data)` → `PATCH /consignment/payouts/{id}/pay/`
- `getMyItems()`, `getMyPayouts()`, `getMySummary()`

---

## Staff Payouts Page

**Page**: `PayoutsPage.tsx` (under `/consignment/payouts` in staff dashboard)

- DataGrid of all payouts
- "Generate Payout" button → dialog: select consignee (from active agreements), period_start, period_end
- "Mark Paid" for pending payouts

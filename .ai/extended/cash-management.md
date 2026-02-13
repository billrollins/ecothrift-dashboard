<!-- Last updated: 2026-02-13T10:53:00-06:00 -->

# Cash Management — Extended Context

## Overview

Cash management covers supplemental drawer (petty cash/change fund), register drawer operations, cash drops, and bank transactions. All cash operations use **JSONField** for bill/coin breakdowns (denomination tracking).

## Denomination Tracking

All cash amounts are stored as both:
- **JSONField** (`amount`, `count`, `current_balance`, etc.): breakdown by denomination (hundreds, fifties, twenties, tens, fives, ones, quarters, dimes, nickels, pennies)
- **DecimalField** (`total`, `opening_total`, `closing_total`, etc.): computed sum

### DenominationCounter Component

Reusable form at `frontend/src/components/forms/DenominationCounter.tsx`:

- Inputs for each denomination (100, 50, 20, 10, 5, 1, 0.25, 0.10, 0.05, 0.01)
- Shows per-denomination subtotal and running total
- Optional `expectedTotal` prop: displays variance (green if within $0.01, warning/error otherwise)
- Exports: `calculateTotal(breakdown)`, `EMPTY_BREAKDOWN`, `DENOMINATIONS`

## Supplemental Drawer

### SupplementalDrawer (`apps/pos/models.py`)

- **One per location**: `OneToOneField` with `WorkLocation`
- Acts as petty cash / change fund
- Fields: `current_balance` (JSONField), `current_total`, `last_counted_by`, `last_counted_at`

### SupplementalTransaction

Types: `draw`, `return`, `audit_adjustment`

| Type | Purpose |
|------|---------|
| **draw** | Take cash out of supplemental (e.g., for register change) |
| **return** | Put cash back into supplemental |
| **audit_adjustment** | Count and reconcile; variance recorded as adjustment |

Fields: `amount` (JSONField), `total`, `related_drawer` (optional), `performed_by`, `notes`

### SupplementalViewSet (`apps/pos/views.py`)

- **Permission**: `IsManagerOrAdmin`
- Endpoints:
  - `GET /pos/supplemental/` — current supplemental status
  - `POST /pos/supplemental/draw/` — draw from supplemental
  - `POST /pos/supplemental/return/` — return to supplemental
  - `POST /pos/supplemental/audit/` — audit (recount); creates `audit_adjustment` if variance
  - `GET /pos/supplemental/transactions/` — recent transactions (last 50)

Note: `get_supplemental()` returns `.first()` — single supplemental drawer per deployment.

## CashDrop

- Safe drops during a shift, taken from the register drawer
- `drawer` (FK), `amount` (JSONField), `total`, `dropped_by`, `notes`
- Endpoint: `POST /pos/drawers/{id}/drop/`

## BankTransaction

- Types: `deposit`, `change_pickup`
- Status: `pending`, `completed`
- Fields: `amount` (JSONField), `total`, `performed_by`, `completed_at`, `notes`
- **Permission**: `IsManagerOrAdmin`
- Endpoints: CRUD + `PATCH /pos/bank-transactions/{id}/complete/`

## Drawer Close Flow

When closing a drawer (`POST /pos/drawers/{id}/close/`):

1. **Expected cash** = `opening_total + cash_sales_total` (drops are recorded but not subtracted in the current implementation)
2. **Variance** = `closing_total - expected_cash`
3. Drawer is marked closed with `closing_count`, `closing_total`, `expected_cash`, `variance`

Cash drops are taken from the drawer during the shift; the close compares the physical count to opening + sales.

## CashManagementPage Layout

`frontend/src/pages/pos/CashManagementPage.tsx`:

- **Supplemental status card**: Current total, location name, recent supplemental transactions (last 10)
- **Bank transactions card**: List of deposits/change pickups with status
- **New Bank Transaction** button: Opens dialog with type (deposit/change pickup) and `DenominationCounter` for amount
- Hooks: `useSupplemental`, `useSupplementalTransactions`, `useBankTransactions`, `useCreateBankTransaction`

Draw/return/audit forms: API and hooks exist (`useDrawFromSupplemental`, `useReturnToSupplemental`, `useAuditSupplemental`) but are not yet wired into the CashManagementPage UI.

## Permissions

- **Supplemental operations** (draw, return, audit): Manager+ only
- **Bank transactions** (create, complete): Manager+ only
- **Cash drop**: Any authenticated employee (via DrawerViewSet)
- **Drawer close**: Any authenticated employee

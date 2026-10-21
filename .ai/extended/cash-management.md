<!-- Last updated: 2026-10-21 (lock the till: checked counts, recount fix, drawer edits managers only) -->

# Cash Management — Extended Context

## Overview

Cash management covers supplemental drawer (petty cash/change fund), register drawer operations, cash drops, and bank transactions. All cash operations use **JSONField** for bill/coin breakdowns (denomination tracking).

## Denomination Tracking

All cash amounts are stored as both:
- **JSONField** (`amount`, `count`, `current_balance`, etc.): breakdown by denomination (hundreds, fifties, twenties, tens, fives, ones, quarters, dimes, nickels, pennies)
- **DecimalField** (`total`, `opening_total`, `closing_total`, etc.): computed sum

### Checked counts (2026-10-21)

`apps/pos/services/cash_counts.py` checks every drawer and supplemental input (open, handoff, takeover, close, drop, draw, return, recount):
- A count has only the ten keys above, each a whole number 0 or more. Anything else is 400 `INVALID_COUNT` with a plain message, never a 500.
- With a count, the stored total **is** the count's sum; a total sent too must match it to the cent.
- With no count, a total alone is used (checked like any money field). Close and handoff need one or the other.
- Drops and supplemental draws/returns must be more than $0; a drop needs an open drawer; a handoff's incoming cashier must be an active staff login other than the current one; a named `related_drawer` must exist.

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
  - `POST /pos/supplemental/audit/` — audit (recount) with `count` + `total` (old names `current_balance` + `current_total` still work); creates `audit_adjustment` if variance. The adjustment's `total` keeps its sign (negative = short, positive = over) and its note says "Recount: $X short/over (was, counted)". Before 2026-10-21 the page's names were not read, so every recount recorded $0 (REG-04).
  - No supplemental drawer: draw, return and audit answer 404
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

1. **Expected cash** = `opening_total + cash_sales_total - drops`. `cash_sales_total` grows by each cash sale's amount due (the change handed back is never in it) and is added in the database, so two sales at once both count.
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
- **Drawer record edit/delete** (`PATCH`/`PUT`/`DELETE /pos/drawers/{id}/`): Manager+ only (2026-10-21, REG-01). Every drawer field is read-only in `DrawerSerializer`, and a drawer with sales, drops or handoffs cannot be deleted (409 `DRAWER_HAS_RECORDS`). Drawers change only through their actions.

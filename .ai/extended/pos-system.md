<!-- Last updated: 2026-02-13T10:53:00-06:00 -->

# Eco-Thrift Dashboard — POS System Context

## POS Models (Backend)

### Register

- Belongs to `core.WorkLocation`
- `name`, `code` (unique), `starting_cash`, `starting_breakdown` (JSON), `is_active`
- One drawer per register per day

### Drawer

- One per register per day (`unique_together: register, date`)
- **Status**: `open` | `closed`
- **Fields**: `current_cashier`, `opened_by`, `opened_at`, `opening_count` (JSON), `opening_total`; `closed_by`, `closed_at`, `closing_count`, `closing_total`; `cash_sales_total`, `expected_cash`, `variance`
- Denomination counts stored as JSON at open, handoff, close, and drop

### DrawerHandoff

- Links drawer to outgoing/incoming cashiers
- `counted_at`, `count` (JSON), `counted_total`, `expected_total`, `variance`, `notes`
- Updates drawer `current_cashier` after handoff

### CashDrop

- `drawer`, `amount` (JSON), `total`, `dropped_by`, `dropped_at`, `notes`
- Used to record cash removed from drawer during shift

### SupplementalDrawer / SupplementalTransaction

- One per location; holds change fund
- Transaction types: `draw`, `return`, `audit_adjustment`

### Cart

- **Status**: `open` | `completed` | `voided`
- **Payment methods**: `cash` | `card` | `split`
- Belongs to `Drawer`, `cashier`; optional `customer`
- `subtotal`, `tax_rate`, `tax_amount`, `total`, `payment_method`, `cash_tendered`, `change_given`, `card_amount`, `completed_at`
- `recalculate()` updates subtotal/tax/total from lines

### CartLine

- `cart`, `item` (inventory.Item, nullable), `description`, `quantity`, `unit_price`, `line_total`
- `line_total` auto-calculated on save

### Receipt

- OneToOne with Cart
- `receipt_number` (unique), `printed`, `emailed`
- **Auto-generation**: `Receipt.generate_receipt_number()` → format `R-YYYYMMDD-NNN` (e.g. `R-20260212-001`)

### RevenueGoal

- `location`, `date`, `goal_amount`
- Used for dashboard metrics and weekly/4-week comparisons

## Drawer Lifecycle

1. **Open** — `POST /pos/drawers/` with `register`, `opening_count`, `opening_total`; one drawer per register per day
2. **Handoff** — `POST /pos/drawers/{id}/handoff/` with `incoming_cashier`, `count`, `counted_total`; updates `current_cashier`
3. **Drops** — `POST /pos/drawers/{id}/drop/` with `amount`, `total`; records cash removed
4. **Close** — `POST /pos/drawers/{id}/close/` with `closing_count`, `closing_total`; sets status `closed`, computes `expected_cash` and `variance`

Denomination counts (JSON) are used at each step for reconciliation.

## Cart / Sale Flow

1. **Create cart** — `POST /pos/carts/` with `drawer`; tax rate from AppSetting `tax_rate` (default 0.07)
2. **Add items** — `POST /pos/carts/{id}/add-item/` with `sku`; looks up Item by SKU, rejects if `sold`; creates CartLine, recalculates cart
3. **Remove line** — `DELETE /pos/carts/{id}/lines/{line_id}/`
4. **Complete** — `POST /pos/carts/{id}/complete/` with `payment_method`, `cash_tendered`, `change_given`, `card_amount`:
   - Updates drawer `cash_sales_total` for cash/split
   - Marks items `sold` (sold_at, sold_for)
   - Handles consignment items (commission, consignee earnings)
   - Creates Receipt with auto-generated receipt number

## Void Flow

- **Manager only** — `POST /pos/carts/{id}/void/` (IsManagerOrAdmin)
- Sets cart status to `voided`
- Reverts items to `on_shelf`; clears `sold_at`, `sold_for`

## Receipt Number Generation

`Receipt.generate_receipt_number()` — prefix `R-{YYYYMMDD}-`, then 3-digit sequence for the day (e.g. `R-20260212-001`, `R-20260212-002`).

## Revenue Goals & Dashboard Metrics

- **RevenueGoal** — per location, per date
- **dashboard_metrics** (`GET /pos/dashboard/metrics/`): today's revenue, today's goal, weekly (Sun–Sat), 4-week comparison, items sold today, active drawers, clocked-in employees
- **dashboard_alerts** (`GET /pos/dashboard/alerts/`): pending time entries, pending sick leave, open drawers

## Terminal Page (`TerminalPage.tsx`)

- **Drawer selection**: Select from open drawers; required before starting sale
- **Start Sale**: Creates cart for selected drawer
- **Add Item**: SKU input (scan or type), Enter or Add button; adds by SKU via `addItemToCart`
- **Cart display**: List of lines with description, qty × price, line total; remove button per line; subtotal, tax, total
- **Payment**: Method (cash/card/split); cash tendered and change due for cash/split; card amount for card/split; Complete Sale button
- Uses `useDrawers`, `useCreateCart`, `useAddItemToCart`, `useRemoveCartLine`, `useCompleteCart` from `usePOS`

## Drawer List Page (`DrawerListPage.tsx`)

- **Per-register cards**: Shows register name/code; if no drawer → "Open Drawer"; if open → cashier, opened at, opening total, cash sales, Handoff / Close Drawer buttons
- **Open Drawer dialog**: DenominationCounter for opening count; POST to create drawer
- **Close Drawer dialog**: DenominationCounter for closing count; POST to close
- **Handoff dialog**: Select incoming cashier (from users, excluding current), DenominationCounter for handoff count; POST handoff
- Uses `useRegisters`, `useDrawers`, `useOpenDrawer`, `useCloseDrawer`, `useDrawerHandoff`, `useUsers`

## API & Hooks

- **pos.api.ts**: registers, drawers (open/handoff/close/drop), supplemental, bank transactions, carts (create/add-item/remove-line/complete/void), dashboard metrics/alerts
- **usePOS.ts**: `useRegisters`, `useDrawers`, `useCarts`, `useOpenDrawer`, `useCloseDrawer`, `useDrawerHandoff`, `useCreateCart`, `useAddItemToCart`, `useRemoveCartLine`, `useCompleteCart`, `useVoidCart`; invalidates drawers/carts/dashboard on mutations

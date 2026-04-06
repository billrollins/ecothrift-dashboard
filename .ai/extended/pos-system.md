<!-- Last updated: 2026-04-06T20:30:00-05:00 -->

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
- `recalculate()` updates subtotal/tax/total from lines (queries `CartLine` by `cart_id` so totals never read a stale `prefetch_related` cache on `cart.lines`)
- `cashier`, `subtotal`, `tax_amount`, `total`, `tax_rate` are **read-only** in `CartSerializer` (server-set)

### CartLine

- `cart`, `item` (inventory.Item, nullable), `description`, `quantity`, `unit_price`, `line_total`
- `line_total` auto-calculated on save
- **`resale_source_sku` / `resale_source_item_id` (optional):** set when a line is created via the register **sold-SKU resale copy** flow (`POST .../add-resale-copy/`). Used for **staff-only** context: POS modal (cashier decision), **Transactions** detail dialog on `/pos/transactions`, inventory/DB views on the `Item`. **Do not** put internal resale provenance on **customer-facing** receipt payloads (printed receipt uses line `description` / product title only; print server unchanged).
- **Manual / unscannable lines:** **`POST .../add-manual-line/`** with `description`, optional `unit_price` (default 0.50), optional `quantity` (default 1) — creates a line with **`item=null`** (no inventory row). Sale **complete** only marks `Item` records sold for lines with `item` set; void only reverts those lines.

### Receipt

- OneToOne with Cart
- `receipt_number` (unique), `printed`, `emailed`
- **Auto-generation**: `Receipt.generate_receipt_number()` → format `R-YYYYMMDD-NNN` (e.g. `R-20260212-001`)

### RevenueGoal

- `location`, `date`, `goal_amount`
- Used for dashboard metrics and weekly/4-week comparisons

---

## Drawer Lifecycle

1. **Open** — `POST /pos/drawers/` with `register`, `opening_count`, `opening_total`; one drawer per register per day
2. **Handoff** — `POST /pos/drawers/{id}/handoff/` with `incoming_cashier`, `count`, `counted_total`; updates `current_cashier`
3. **Takeover** — `POST /pos/drawers/{id}/takeover/` with optional `count`, `counted_total`, `notes`; incoming cashier claims drawer
4. **Drops** — `POST /pos/drawers/{id}/drop/` with `amount`, `total`; records cash removed
5. **Close** — `POST /pos/drawers/{id}/close/` with `closing_count`, `closing_total`; sets status `closed`, computes `expected_cash` and `variance`
6. **Reopen** — `POST /pos/drawers/{id}/reopen/` — Manager/Admin only; sets status back to `open`; optional `cashier` body param to reassign

Denomination counts (JSON) are used at each step for reconciliation.

---

## Cart / Sale Flow

1. **Create cart** — `POST /pos/carts/` with `drawer`; tax rate from AppSetting `tax_rate` (default 0.07); only valid if drawer `status == 'open'`
2. **Add items** — `POST /pos/carts/{id}/add-item/` with `sku`; looks up Item by SKU; rejects if `sold` (response includes `ITEM_ALREADY_SOLD` + `sku`/`title` for staff UI); if same item already in cart, **increments quantity** on existing line (no duplicate lines); creates CartLine otherwise; `recalculate()` then persists correct aggregates; response re-fetches cart with prefetched lines for serialization. **`POST .../add-resale-copy/`** — atomic duplicate-for-resale + line with `resale_source_*` when cashier confirms from the sold-SKU modal. **`POST .../add-manual-line/`** — add a line without an inventory item (unscannable / pink tag); `item` stays null.
3. **Update line** — `PATCH /pos/carts/{id}/lines/{line_id}/` — updates `quantity`, `description`, and/or `unit_price`; recalculates
4. **Remove line** — `DELETE /pos/carts/{id}/lines/{line_id}/` — removes line; recalculates
   - Lines 3 and 4 are served by the single `manage_line` action (`url_path='lines/(?P<line_id>[^/.]+)'`) which dispatches on HTTP method
5. **Complete** — `POST /pos/carts/{id}/complete/` with `payment_method`, `cash_tendered`, `card_amount`:
   - Updates drawer `cash_sales_total` for cash/split
   - Marks items `sold` (sold_at, sold_for)
   - Handles consignment items (commission, consignee earnings)
   - Creates Receipt with auto-generated receipt number

---

## Void Flow

- **Manager only** — `POST /pos/carts/{id}/void/` (IsManagerOrAdmin)
- Sets cart status to `voided`
- Reverts items to `on_shelf`; clears `sold_at`, `sold_for`

---

## CartFilter (`apps/pos/filters.py`)

Custom `django-filters` FilterSet on Cart. Handles:

- `?status=open` → filters to open carts only
- `?status=completed` → completed carts only
- `?status=voided` → voided carts only
- `?status=all` → both completed and voided (for transactions page)
- `?drawer=`, `?cashier=`, `?payment_method=`, `?receipt_number=` (icontains on receipt number), `?date_from=`, `?date_to=`

---

## Device Identity Pattern

Each physical machine stores its device type in `localStorage` under the key `pos_device_config` (JSON):

```json
{
  "deviceType": "register",
  "registerId": 1
}
```

Possible `deviceType` values: `"register"`, `"manager"`, `"online_sales"`, `"processing"`, `"mobile"`.

The `useDeviceConfig` hook (`frontend/src/hooks/useDeviceConfig.ts`) reads/writes this via `useSyncExternalStore` with a **stable cached snapshot** to prevent infinite re-renders. `isRegister` is derived as `config?.deviceType === 'register'`.

---

## Terminal State Machine

`TerminalPage.tsx` uses a `TerminalState` union type and `deriveTerminalState()` function to pick the correct full-page UI:

| State | Condition |
|-------|-----------|
| `unconfigured` | No `pos_device_config` in localStorage |
| `loading` | Drawer query in-flight |
| `no_drawer` | Register device, drawer query done, no drawer for today |
| `drawer_open_other` | Drawer open but assigned to a different cashier |
| `ready` / `active_sale` | Drawer open and owned by current user; falls through to same UI — sale interface shown immediately |
| `drawer_closed` | Today's drawer exists but is closed |
| `manager_mode` | `deviceType !== 'register'`; shows all open drawers to pick from |

---

## Terminal Page (`TerminalPage.tsx`)

- **Device setup**: Settings icon in PageHeader — always visible, opens `DeviceSetupDialog`
- **Drawer open**: Dialog with `DenominationCounter` for opening count; `POST /pos/drawers/`
- **Takeover**: Button shown when drawer owned by another cashier; `POST /pos/drawers/{id}/takeover/`
- **Lazy cart creation**: Cart is created on first item scan, not on "Start Sale" (no Start Sale button in ready state)
- **Cart persistence**: On mount, `useEffect` calls `getCarts({ drawer, status: 'open' })` **directly** (not via React Query cache) to restore any in-progress cart; `hasRestoredRef` prevents re-restoration after void/complete
- **SKU scan / customer lookup**: Unified input; `CUS-XXX` pattern triggers customer lookup; all other input treated as SKU
- **Inline line editing**: Edit icon opens in-place `TextField`s for `quantity`, `description`, `unit_price` per line; Save/Cancel buttons; calls `PATCH /pos/carts/{id}/lines/{line_id}/`
- **Remove line**: Optimistic UI (line removed from local state immediately); calls `DELETE /pos/carts/{id}/lines/{line_id}/`; rolls back on error
- **Void Sale**: Red "Void" button + `ConfirmDialog`; Manager/Admin only; calls `POST /pos/carts/{id}/void/`
- **Complete sale**: Disabled if cart has no items; validates payment amounts; calls `POST /pos/carts/{id}/complete/`; triggers `localPrintService.printReceipt()` with cash drawer auto-open for cash/split

---

## Drawer List Page (`DrawerListPage.tsx`)

- **Manager view**: Cards for all registers; cashier view limited to their own register
- **Unconfigured guard**: If device has no config and user is not manager, shows an `Alert` directing to POS Terminal settings
- **Per-register cards**: Shows register name/code; if no drawer → "Open Drawer"; if open → cashier, opened at, opening total, cash sales, Handoff / Close Drawer / Takeover buttons; if closed → "Drawer Closed" + "Reopen Drawer" (Manager+ only, amber)
- **Open Drawer dialog**: DenominationCounter; `POST /pos/drawers/`
- **Close Drawer dialog**: DenominationCounter; `POST /pos/drawers/{id}/close/`
- **Handoff dialog**: Select incoming cashier, DenominationCounter; `POST /pos/drawers/{id}/handoff/`
- **Reopen dialog**: Manager confirmation; `POST /pos/drawers/{id}/reopen/`

---

## Transactions Page (`TransactionListPage.tsx`)

- Default `statusFilter` is `'all'` (shows both completed and voided)
- Filters: receipt number search, cashier dropdown, status (All / Completed / Voided), date range
- Actions per row: reprint receipt, void (Manager+)

---

## API & Hooks

### `pos.api.ts`
Functions: `getRegisters`, `getDrawers`, `openDrawer`, `drawerHandoff`, `drawerTakeover`, `closeDrawer`, `reopenDrawer`, `cashDrop`, `getSupplemental`, `drawFromSupplemental`, `returnToSupplemental`, `auditSupplemental`, `getSupplementalTransactions`, `getBankTransactions`, `createBankTransaction`, `updateBankTransaction`, `completeBankTransaction`, `createCart`, `updateCart`, `getCart`, `addItemToCart`, `updateCartLine`, `removeCartLine`, `completeCart`, `voidCart`, `getCarts`, `getDashboardMetrics`, `getDashboardAlerts`

### `usePOS.ts`
Hooks: `useRegisters`, `useDrawers` (accepts `options.enabled`), `useCarts` (accepts `options.enabled`), `useOpenDrawer`, `useCloseDrawer`, `useReopenDrawer`, `useDrawerHandoff`, `useDrawerTakeover`, `useCreateCart`, `useAddItemToCart`, `useUpdateCartLine`, `useRemoveCartLine`, `useCompleteCart`, `useVoidCart`

---

## Revenue Goals & Dashboard Metrics

- **RevenueGoal** — per location, per date
- **dashboard_metrics** (`GET /pos/dashboard/metrics/`): today's revenue, today's goal, weekly (Sun–Sat), 4-week comparison, items sold today, active drawers, clocked-in employees
- **dashboard_alerts** (`GET /pos/dashboard/alerts/`): pending time entries, pending sick leave, open drawers

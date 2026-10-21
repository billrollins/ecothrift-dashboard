<!-- Last updated: 2026-10-21 (lock the till: sale records managers only, server change, double-tap lock; owner-only sale settings, line sale off by default; store-local dates) -->

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

- **Status**: `open` | `completed` | `voided` | `training` | `suspended` (set aside, see Suspend below; `suspended_at` is when)
- **Payment methods**: `cash` | `card` | `split`
- Belongs to `Drawer`, `cashier`; optional `customer`
- `subtotal`, `tax_rate`, `tax_amount`, `total`, `payment_method`, `cash_tendered`, `change_given`, `card_amount`, `completed_at`
- **CardX surcharge (record-only):** `card_type` (`''` | `credit` | `debit`), `card_surcharge_rate` (4dp, e.g. `0.0300`), `card_surcharge_amount`, `card_charged_total` (`card_amount` + surcharge). After-sale correction stamps `card_type_fixed_at` / `card_type_fixed_by`. Not part of `total`, not taxed, not in drawer `expected_cash`. Setting `pos.card_surcharge` = `{enabled, percent}` (percent is 3 for 3%). Service: `apps/pos/services/card_surcharge.py` (`ROUND_HALF_UP`). `CARD_TYPE_FIX_WINDOW_MINUTES = 15`.
- `recalculate()` updates subtotal/tax/total from lines (queries `CartLine` by `cart_id` so totals never read a stale `prefetch_related` cache on `cart.lines`)
- `cashier`, `subtotal`, `tax_amount`, `total`, `tax_rate`, `card_type`, `card_surcharge_rate`, `card_surcharge_amount`, `card_charged_total`, `card_type_fixed_at`, `card_type_fixed_by`, `card_type_fixed_by_name`, `card_type_fix_deadline` are **read-only** in `CartSerializer` (server-set)

### CartLine

- `cart`, `item` (inventory.Item, nullable), `description`, `quantity`, `unit_price`, `line_total`
- `line_kind`: `item` | `manual` | `discount` | `delivery` | `assembly`
- `sale_label` (`''` | `labor_day` | `summer`) and `sale_percent`. `unit_price` is list/shelf price. `save()` sets `line_total = unit_price × quantity × (1 − sale_percent/100)`.
- Eligible for sale: `item` and `manual` only. Assembly, delivery, and discount never get a sale.
- `line_total` auto-calculated on save
- **`resale_source_sku` / `resale_source_item_id` (optional):** set when a line is created via the register **sold-SKU resale copy** flow (`POST .../add-resale-copy/`). Used for **staff-only** context: POS modal (cashier decision), **Transactions** detail dialog on `/pos/transactions`, inventory/DB views on the `Item`. **Do not** put internal resale provenance on **customer-facing** receipt payloads (printed receipt uses line `description` / product title only; print server unchanged).
- **Manual / unscannable lines:** **`POST .../add-manual-line/`** with `description`, optional `unit_price` (default 0.50), optional `quantity` (default 1) — creates a line with **`item=null`** (no inventory row). Sale **complete** only marks `Item` records sold for lines with `item` set; void only reverts those lines.
- **Assembly:** **`POST .../add-assembly/`** — `$35` `line_kind=assembly`; bumps quantity if an assembly line already exists. Never sale-discounted.
- **Store sale (Labor Day) and line sale (was Summer), REG-21:** AppSetting `pos.labor_day_sale` `{override, start, end}` holds the store sale's calendar (default first Monday of September through +5 days). Owner settings (Settings → Store → Sales; Admin or superuser only, server-checked): `pos.store_sale_name` (default Labor Day), `pos.store_sale_percent` (fraction, default 0.10; falls back to the old `percent` in `pos.labor_day_sale`), `pos.line_sale_on` (default **off**: no tile), `pos.line_sale_name` (default Summer), `pos.line_sale_percent` (default 0.50). `GET /api/pos/sale-mode/` (staff) gives `name`, `percent`, `active`, `line_sale {on, name, percent}`; `POST` (the override) is the owner's only (403 otherwise). `POST .../lines/{id}/sale/` with `sale` `summer` (the line sale; `SALE_OFF` 400 while off) | `labor_day` | `none`. A marked line keeps the percent it was marked at. `POST .../sync-sale/` re-applies the store sale (line-sale lines stay). Cart lines carry `sale_display` ("Labor Day 10%") for chips and receipts. Complete writes `sold_for` as the effective sale unit price. Existing store-credit discount stacks on sale `line_total`.
- **The store's day:** drawers, the manager alert and the dashboard's "today" use `timezone.localdate()` (America/Chicago), never `timezone.now().date()` (UTC: tomorrow from about 7 PM). For a moment's day use `apps/core/local_dates.local_day(dt)`.

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
5. **Close** — `POST /pos/drawers/{id}/close/` with `closing_count`, `closing_total`; sets status `closed`, computes `expected_cash` and `variance`. Drawer payload also has read-only `card_sales_total` and `card_surcharge_total` (completed carts; surcharge is never in expected cash).
6. **Reopen** — `POST /pos/drawers/{id}/reopen/` — Manager/Admin only; sets status back to `open`; optional `cashier` body param to reassign

Denomination counts (JSON) are used at each step for reconciliation.

---

## Cart / Sale Flow

0. **Sale records are locked (2026-10-21, REG-01):** `PATCH`/`PUT`/`DELETE /pos/carts/{id}/` are Manager+ only; status and every money field (`status`, `payment_method`, `cash_tendered`, `change_given`, `card_amount`, `completed_at`, totals) are read-only in `CartSerializer`, and a sale never moves drawer; only an open sale can be deleted (409 `SALE_FINISHED`, void a paid one). A finished sale (completed, voided, training) takes no add-item or line change (400 `SALE_FINISHED`).
1. **Create cart** — `POST /pos/carts/` with `drawer`; tax rate from AppSetting `tax_rate` (default 0.07); only valid if drawer `status == 'open'`
2. **Add items** — `POST /pos/carts/{id}/add-item/` with `sku`; looks up Item by SKU; **next unit (2026-10-20):** when the scanned item is already `sold`, or already on this sale, the register rings the **next unsold unit** instead (`services/next_unit.py`: same check-in, or same PO + manifest row; same product, price, condition and source; `on_shelf`; not on any open sale; never a web-listed, reserved or consignment item) and the response carries `unit_swapped {scanned_sku, added_sku}` (the register says so). The same item is never sold twice, so a repeat scan no longer makes quantity 2. Only when no other unit is left: a sold tag still gets the old handling (sold-tag move, else `ITEM_ALREADY_SOLD` + `sku`/`title` for the staff dialog); an unsold item already on the sale gets `ITEM_ALREADY_IN_CART` (400, plain message, ring a second one as an unscannable item). The training register keeps its own rules (sold tag rings as is; repeat scan bumps quantity); creates CartLine otherwise; `recalculate()` then persists correct aggregates; response re-fetches cart with prefetched lines for serialization. **`POST .../add-resale-copy/`** — atomic duplicate-for-resale + line with `resale_source_*` when cashier confirms from the sold-SKU modal. **`POST .../add-manual-line/`** — add a line without an inventory item (unscannable / pink tag); `item` stays null.
3. **Update line** — `PATCH /pos/carts/{id}/lines/{line_id}/` — updates `quantity`, `description`, and/or `unit_price`; recalculates. Raising the quantity of an **item** line adds the next unsold units as their own quantity-1 lines (same price and sale label); if there are not enough, 400 `NOT_ENOUGH_UNITS` and nothing changes. A non-whole `quantity` is 400 `INVALID_QUANTITY`.
4. **Remove line** — `DELETE /pos/carts/{id}/lines/{line_id}/` — removes line; recalculates
   - Lines 3 and 4 are served by the single `manage_line` action (`url_path='lines/(?P<line_id>[^/.]+)'`) which dispatches on HTTP method
5. **Complete** — `POST /pos/carts/{id}/complete/` with `payment_method`, `cash_tendered`, `card_amount`; card/split also require `card_type` (`credit` | `debit`) and may send `card_charged_total` (must match the server). Cash rejects a set `card_type`. **Input checks (2026-10-20):** every money field (`cash_tendered`, `change_given`, `card_amount`, `card_charged_total`) goes through `parse_money` (`services/card_surcharge.py`) before anything is written: a number or numeric string, not negative, at most two decimals, at most 99,999,999.99; text, NaN, Infinity, booleans and lists are refused. `cash_tendered` is required on cash and split. A bad one is 400 `INVALID_AMOUNT` with a plain message naming the field; a non-text `payment_method` or `card_type`, a bad `payroll_employee` or a non-object body is also a 400, never a 500. `payment_method` is validated against `Cart.PAYMENT_METHODS`.
   - **The server works out the change (2026-10-21, REG-02):** cash must cover the amount due (`CASH_SHORT`); `change_given` is stored as cash less the amount due, and a `change_given` sent by the screen must match it (`CHANGE_MISMATCH`). Split: some cash, less than the due, and `card_amount` exactly the rest (`SPLIT_MISMATCH`), no change. Card: a `card_amount` sent must equal the due (`CARD_MISMATCH`); cash typed on a card or payroll sale is not stored. A closed drawer refuses payment (`DRAWER_CLOSED`).
   - **Double tap (2026-10-21):** the write locks the sale's row and re-checks it is open; the tap that loses the race gets 409 `SALE_ALREADY_COMPLETED` and writes nothing. The register also ignores a second Complete while the first is on its way.
   - Server computes surcharge from `pos.card_surcharge` on the card portion only
   - Updates drawer `cash_sales_total` for cash/split (surcharge excluded)
   - Marks items `sold` (sold_at, sold_for)
   - Handles consignment items (commission, consignee earnings)
   - Creates Receipt with auto-generated receipt number
6. **Card preview** — `GET /pos/carts/{id}/card-preview/?payment_method=&card_amount=` returns `{enabled, percent, rate, card_base, no_surcharge, with_surcharge, surcharge_amount}` for the Terminal match buttons.
7. **Fix card type** — `POST /pos/carts/{id}/card-type/` with `{card_type: credit|debit}` on a completed card/split sale. Recomputes surcharge from stored `card_amount` via `apply_card_surcharge`. 400 if not completed, cash, invalid/same type. 403 `CARD_TYPE_FIX_LOCKED` after 15 minutes unless `is_superuser`. Stamps `card_type_fixed_at` / `card_type_fixed_by`. Does not change `total`, `sold_for`, or drawer cash.

---

## Payroll deduction (staff, owner 2026-10-07)

- **Payment method `payroll`** ("Payroll deduction (staff)" on the register). It shows only while the owner's switch is on: AppSetting `pos.staff_purchases` = `{payroll_deduction, payroll_max_percent (25), thrift_plus_free}`, all off at first. It's edited on Settings → Store → Staff purchases, by Admin only. The generic settings API refuses this key to managers (`AppSettingViewSet.OWNER_ONLY`).
- **Complete** with `{payment_method: 'payroll', payroll_employee: <user id>}`. `Cart.payroll_employee` records whose paycheck it comes from. The checks, in `apps/pos/services/staff_purchases.py` `eligibility` and `check_floor_day`:
  - the switch is on, and the buyer is active staff;
  - the cashier is not the buyer;
  - the buyer had a last paycheck: the gross for the previous biweekly period, time-clock hours × pay rate, more than $0. New hires don't qualify;
  - this pay period's payroll sales plus this one stay ≤ the cap % of that paycheck;
  - every item has been on the floor 24 hours (`Item.listed_at`; no date means allowed).
- No drawer cash and no card fields (`apply_card_surcharge` treats it like cash). A void takes it off the list.
- **People → Payroll deductions** (`/people/payroll-deductions`): per pay period, per person, the sales and a total to enter in QuickBooks Payroll for the paycheck after the period. **Mark entered** writes `PayrollDeductionMark` (the amount then); a later void shows a mismatch.
- API: `/api/pos/staff-purchases/settings/` (GET staff, PUT Admin), `people/`, `eligibility/?employee=&amount=`, `deductions/?day=`, `deductions/mark/`.

## Suspend (owner 2026-10-20, `pos.0037`)

- **What it is.** A cashier sets the current sale aside, rings someone else, and brings it back. In the header above the cart the terminal shows a **Suspend** button and one **bookmark tab** per sale set aside at that register (`components/pos/SuspendedSalesBar.tsx`): label = the Thrift+ member's first name, or "Sale"; item count, total, time set aside. Click a tab to bring it back. **Right-click** a tab (long-press on touch) opens "Delete suspended sale" with a confirm.
- **Server** (`apps/pos/services/suspend.py`, actions on `CartViewSet`): `POST carts/{id}/suspend/` (open, at least one line), `POST carts/{id}/resume/` (body `current` = the sale on screen: set aside in its place when it has lines, voided when empty; answers the fresh cart, totals and Thrift+ block worked out again), `POST carts/{id}/delete-suspended/` (any cashier; voids it), `GET carts/suspended/?drawer=&cashier=` (the tabs). `?status=suspended` also filters the cart list; `open` and `all` never show suspended sales, so the terminal's restore-on-load ignores them.
- **Items are held, not sold.** A suspended cart changes no item (they stay `on_shelf`). `add-item` refuses an item that is on any other register's suspended sale (`ITEM_SET_ASIDE`), and `complete` refuses an open sale holding such an item. Training register sales neither hold nor are held. Resume refuses (`ITEM_SOLD`) if an item sold in the meantime. A suspended cart cannot be edited or paid until it is back (`SALE_SET_ASIDE`). Deleting it, or the drawer closing, voids it: no drawer cash and no item change (it never sold), delivery jobs cancelled, Thrift+ ledger reversed if any.
- **Drawer close.** `POST drawers/{id}/close/` answers **409 `SUSPENDED_SALES`** (count and tabs) while sales are set aside and nothing closes. Sending `void_suspended: true` voids them and closes. Drawers page shows the warning ("Close and delete them").
- **Shared drawer.** Suspended sales belong to the drawer, not the cashier (a handoff keeps them). The test terminal passes `cashier` so each computer sees only its own tabs.
- Thrift+: a suspended sale holds no member credit; resume works it out again (rulebook, Owner 10-20).

## Void Flow

- **Manager only** — `POST /pos/carts/{id}/void/` (IsManagerOrAdmin). A second void is a 400.
- Sets cart status to `voided` (under a row lock).
- **A paid sale** (`completed`): takes `_sale_cash(cart)` back out of the drawer's `cash_sales_total` (the same amount complete added: cash covered, less a split's card part and change), while the drawer is open. Reverts its items to `on_shelf` and clears `sold_at` / `sold_for`, unless another paid sale holds the item.
- **A sale voided before payment** (`open`): no drawer change and no item change. It never sold anything, and its item may be on the sale that was paid.
- Then Thrift+ `after_void` reverses any ledger rows.
- No receipt: a sale voided before payment never got one. Transactions shows "Not paid" for it.

**One cart per sale (register, 2026-10-06).** `TerminalPage` `startCart` makes the cart once; every scan, manual line or button that needs a cart while it is being made waits for that same cart. The same scan pressed again while it is on its way is ignored. Before this, a slow server (a dyno restart after a deploy) turned repeated scans into 3–4 carts holding the same item, and voiding the extras put the sold item back on the shelf.

---

## CartFilter (`apps/pos/filters.py`)

Custom `django-filters` FilterSet on Cart. Handles:

- `?status=open` → filters to open carts only
- `?status=completed` → completed carts only
- `?status=voided` → voided carts only
- `?status=all` → both completed and voided (for transactions page)
- `?drawer=`, `?cashier=`, `?payment_method=`, `?card_type=`, `?receipt_number=` (icontains on receipt number), `?date_from=`, `?date_to=`

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
- **SKU scan / member QR**: Unified input; a Thrift+ member QR attaches the member; all other input is treated as a SKU. The old `CUS-XXX` customer scan is gone (T62, 2026-10-20): `Cart.customer` is no longer set (read-only in the API), and the customer on a sale is the Thrift+ member (`CartMember`).
- **Inline line editing**: Edit icon opens in-place `TextField`s for `quantity`, `description`, `unit_price` per line; Save/Cancel buttons; calls `PATCH /pos/carts/{id}/lines/{line_id}/`
- **Remove line**: Optimistic UI (line removed from local state immediately); calls `DELETE /pos/carts/{id}/lines/{line_id}/`; rolls back on error
- **Void Sale**: Red "Void" button + `ConfirmDialog`; Manager/Admin only; calls `POST /pos/carts/{id}/void/`
- **Cart list viewport**: Cart `Paper` fills leftover main height (md+); line list scrolls inside; subtotal/tax/total stay pinned under the list. After add-item / qty bump / manual line / resale copy / line edit, the **affected** line scrolls into view (`scrollIntoView({ block: 'nearest' })`). Seeded QA SKUs: `python manage.py seed_pos_terminal_test_items` (`POSTEST##`).
- **Store sale / line sale / Assembly**: Header chip shows the store sale only while it is on; only the owner can click it off. Buttons **Assembly · $35** and the line sale tile (owner-named, e.g. **Summer · 50%**, shown only while `pos.line_sale_on`; checkbox dialog of item/manual lines). Sale chips and sale-savings row on the cart. Receipts print the effective unit price and a ` (10% Labor Day)` / ` (50% Summer)` suffix. `Cart.savings` groups sale and discount dollars; under TOTAL the print server draws a YOU SAVED block from that payload (`receipt_data.savings` + legacy `you_saved`).
- **Discount / store credit**: `POST …/add-discount/` adds a negative `line_kind=discount` line. Body: `mode` `amount` (default) or `percent`, `amount` and/or `percent`, `reason`, optional `target_line_id`. Terminal dialog: reason first (In-store credit, Google Review, Other), `$`/`%` toggle with both values shown, apply **Full ticket** or **Per line**. Google Review autofills 5% / **Full ticket**, requires **username + stars**, and the server caps that offer at **$5**. Username typeahead is `GET /pos/carts/google-review-usernames/`. The same Google username cannot redeem again on any open or completed cart (voided sales do not count). Cannot exceed merchandise/delivery total.
- **Delivery fee**: `POST …/add-delivery/` with `tier` `5mi` ($50) or `10mi` ($75); requires name/phone/address/`items_delivered`; Apt? requires Unit #; optional `availability_id` **or** `schedule_later` / omit date → `DeliveryJob` status `needs_scheduling` (nullable availability/date; migration `pos.0013`); optional `notes`. Address suggest `GET /pos/delivery/address-suggest/?q=` uses **US Census** geocoder (Nominatim fallback), returns distance to **8425 West Center Road** and recommended tier; over 10 mi → `too_far` (terminal popup, cannot add). After schedule-later, terminal shows Saturday / must-be-home reminder.
- **Delivery scheduling**: `DeliveryAvailability` (date/times/crew/who) + `DeliveryJob`; APIs `/pos/delivery-availabilities/`, `/pos/delivery-jobs/` (`GET`/`POST`/`PATCH`); Dash page `/pos/deliveries` **Add delivery** (Manager): past sale lines, inventory SKU, or free-text; `POST /delivery-jobs/` creates cart-optional jobs (no fee line). Warns on `needs_scheduling`; Schedule dialog `PATCH` with `availability_id` (+ notes) returns `customer_schedule_message` / `just_scheduled`. Void cart or remove delivery line cancels active jobs (including needs_scheduling).
- **Delivery Desk + Field (v2.56 / Phase 2):** `/pos/deliveries` redirects by experience preference. **Field** (`/pos/deliveries/field/days/:dayId`) owns Start Today and the ordered day: **calls → load → truck → route → active → return** (`FieldRunShell`). Contact attempts (`call_placed` / `composer_opened` / `text_marked_sent`) are separate from stop **dispositions**; departure requires confirmed/rescheduled/cancelled/excluded resolution plus item verify/load/photo + truck close (or manager override). **Desk** day detail shows read-only `DeskDayLiveMonitor` (no wizard). Canonical APIs: `/api/pos/delivery-days/{id}/run/` + `start-run/`, stop contact/disposition/item endpoints. Legacy board `/pos/deliveries/legacy` is a one-release escape hatch. Phase 3 still owns provider-proven ETAs, signature rebuild, SMS polish. (Older unified board notes: `pos.0017`–`pos.0018`; Phase 2 schema `pos.0023`.). Job PATCH `completed` blocked while open-run stop incomplete. APIs under `/pos/delivery-runs/` and `/pos/delivery-stops/` (+ `report-issue`, job `reschedule`, `append-address`, events/`next_action`/`allowed_actions` on run payload).
- **Printables**: static HTML under `frontend/public/pos/` (appliance policy EN+es-MX, sell log, delivery driver log) + Cashier nav **Printables** (`/pos/printables`).
- **Thrift+ member button (owner 2026-10-20):** the cart's top bar has one **Thrift+ member** button (shown while Thrift+ is live there) and **Refresh**. The terminal's old "Thrift+ finish joining" and "Thrift+ 3-day return" buttons and the panel's scan-QR / phone boxes are gone. The button opens `ThriftMemberDialog`: Find (`MemberFind`, the Staff app's search), pick → `register/attach/`; someone still to finish opens the member card to Finalize (the ID check, then Match; `register/finish/` with `cart` attaches them). With a member on the sale it opens `MemberCard` (also reached by tapping the member in `ThriftPlusPanel`): ThriftBucks collected / used / balance, Thrift+ credit, trips, people, Add a 2nd person, Remove from sale. The card's data is `GET /thriftplus/register/member/?person=<id>` (or `?code=`), `apps/thriftplus/services/member_card.py`. A pending member's QR scanned into the item box opens the card too. The training register keeps a **Practice sign-up** in the dialog.
- **Refresh:** `POST /pos/carts/{id}/refresh/` works an open cart out again (`recalculate()`, so Thrift+ credit, ThriftBucks and the member's status are today's) and answers it; any other cart is answered as it is. `refreshCart()` in `thriftplusRegister.api.ts`.
- **Returns popup:** the Thrift+ cart block has `returns_until` (ISO, sale day + 3, `apps/thriftplus/services/returns.deadline`) when the sale has a member and a 3-day-return line, for open and finished carts alike, and a finished cart's `return_note` (the closed-days line, `closed_note(sold_on)`) comes with it. `finishCompletedSale` shows `ReturnsPopup` ("Say: Returns are valid through ... and are 80% store credit."), which has to be tapped through. The member block also has `standing` (pending / member / off).
- **Thrift+ members page:** `/pos/members` (`MembersLookupPage`, Cashier menu): Find, then `MemberCard`; `?person=<person_id>` opens a card.
- **Complete sale**: Disabled if cart has no items; validates payment amounts; rejects negative total. Card amount is never typed: **card** = cart total; **split** = total minus cash (read-only Card line). Split with blank cash or cash covering the total is blocked. Cash completes immediately. Card/split opens one-window `CardTenderDialog` (TYPE THIS INTO CARDX amount + YES rule, then CARDX DIDN'T ASK / SURCHARGED buttons from `card-preview`). Disabled `pos.card_surcharge` skips the dialog and posts `card_type: debit`. Then `POST /pos/carts/{id}/complete/`; `printReceipt(..., open_drawer)` for cash/split. Drawer kick failure does not fail the receipt; the Terminal warns “Receipt printed but the drawer did not open”.
- **Transactions:** Payment filter includes Credit / Debit (`card_type`). Detail shows card type, surcharge, card total, and a "Card type fixed by {name} · {time}" stamp. **Fix card type** (next to Void) is available for 15 minutes after `completed_at` for any employee; after that only a superuser. The dialog has two stacked **Change to … and print receipt** buttons (current choice tagged Current). A successful change reprints the receipt.

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
- Filters: one **Search** box (receipt number or Thrift+ member name, `q`; searches 0.4 s after typing stops), date range with chips (Today, Yesterday, This week from Monday, This month, Last 30 days, All time), cashier, status (All / Completed / Voided), payment
- **Totals block** (owner 10-20): `GET /pos/carts/summary/` takes the list's filters and answers the old `{count, total, average, voided_count, thrift_count, by_method}` plus `sales_numbers` (see **Sales numbers** below). The page shows one block (`SalesNumbersBlock`): Sales (Item sales, Returns, Net item sales, Thrift+ revenue), Tax and fees (Tax, Fees customers paid, Fees we pay, "Card type not set" when there is some), Paid with (Cash, Card with Debit / Credit / not set, Payroll deduction if any, Thrift+ credit, ThriftBucks from earlier visits). Returns are counted by return day inside the date filter; other filters (register, cashier, how paid, search) narrow them by the original sale. Expired ThriftBucks count as Thrift+ revenue inside the date range when no sale filter is set. Training registers stay out, as in the list.
- **Thrift+ columns:** each list row carries `thrift_row` (`member`, `earned` = sale and re-ring ThriftBucks ledger rows, `used` = kept ThriftBucks spent, `credit_used`, `instant` = the lines' `thrift_savings`), null for a guest. The list annotates `earned` in one subquery. The table shows Used as ThriftBucks plus credit.
- The table fills the rest of the screen (`calc(100vh - 300px)`, compact rows).
- Actions per row: reprint receipt, fix card type (15 min then superuser), void (Manager+)

---

## API & Hooks

### `pos.api.ts`
Functions: `getRegisters`, `getDrawers`, `openDrawer`, `drawerHandoff`, `drawerTakeover`, `closeDrawer`, `reopenDrawer`, `cashDrop`, `getSupplemental`, `drawFromSupplemental`, `returnToSupplemental`, `auditSupplemental`, `getSupplementalTransactions`, `getBankTransactions`, `createBankTransaction`, `updateBankTransaction`, `completeBankTransaction`, `createCart`, `updateCart`, `getCart`, `addItemToCart`, `updateCartLine`, `removeCartLine`, `completeCart`, `getCartCardPreview`, `voidCart`, `getSuspendedCarts`, `suspendCart`, `resumeCart`, `deleteSuspendedCart`, `setCartCardType`, `getCarts`, `getDashboardMetrics`, `getDashboardAlerts`

### `usePOS.ts`
Hooks: `useRegisters`, `useDrawers` (accepts `options.enabled`), `useCarts` (accepts `options.enabled`), `useOpenDrawer`, `useCloseDrawer`, `useReopenDrawer`, `useDrawerHandoff`, `useDrawerTakeover`, `useCreateCart`, `useAddItemToCart`, `useUpdateCartLine`, `useRemoveCartLine`, `useCompleteCart`, `useCardPreview`, `useVoidCart`, `useSetCartCardType`, `useCardTypeFixWindow`

---

## Revenue Goals & Dashboard Metrics

- **DashboardSalesGoal** / **DashboardDepartmentGoal** — weekly targets; CRUD under **`/api/pos/dashboard/`**. Retail keeps `schedule = {weekdays: [0..6], audits_per_day: N}` (`pos.0019`) and drops the letter-grade `value`.
- **dashboard_metrics** (`GET /api/pos/dashboard/metrics/?weeks=`): sales run-rate (90-day chart, 14-week book), department cards (buying, processing, restoration, retail routine completion), cached 45s — **`apps/pos/services/dashboard_metrics.py`**. Weekly day rows include **`card_surcharge_total`**. The Sales number (`today`, `revenue`, `week_total`, the 90-day chart, the goal) is **Net item sales**; days and weeks also carry **`returns`** and **`thriftplus_revenue`** (`week_returns`, `week_thriftplus_revenue`; `sales.today_returns`, `sales.today_thriftplus_revenue`), shown as two small lines under the headline. `weeks` defaults to **8** (clamped 2–12). Retail daily/week progress is scheduled versus completed routine submissions; days expose **`retail_audit_ids`** (run ids). Gold when the day's count meets the schedule. Day cells deep-link to that run.
## Sales numbers (owner 10-20)

One service counts every sales figure: **`apps/pos/services/sales_numbers.py`** (Dash, Transactions and the AI brief all use it; a few grouped queries, no per-sale loops). A day is the America/Chicago day. Only completed sales on real registers count (training and voided never do).

- **Item sales:** each item line's price after markdowns (and any discount lines), **less the full ThriftBucks the line collected**, whether the member kept them or redeemed instantly. Guests: the price after markdowns. ThriftBucks a member **uses from earlier trips** (the one ThriftBucks discount line) do **not** cut item sales: they pay from what we owe, already taken out when earned. The delivery and assembly fees are not item sales: they are fees customers paid.
- **Returns** (Thrift+ 3-day returns, on the return day, negative): the credit given before tax, plus the ThriftBucks given back for earlier ThriftBucks used, less the ThriftBucks taken back (what could not be taken back came off the credit, so it counts as taken). Returns is always 80% of the item's item sales: when the item was redeemed instantly, the rest of what the return gives back (80% of that sale's Thrift+ revenue) comes off **Thrift+ revenue** on the same day instead. The tax part of the refund is under Tax.
- **Net item sales** = Item sales + Returns. The big number: Dash's Sales, the weekly goal, the chart.
- **Thrift+ revenue:** (a) on the sale day, the half of the ThriftBucks not given when a member redeems instantly (ThriftBucks redeemed less the instant amount off); (b) on the day they expire, kept ThriftBucks that ran out unused (the ledger's `expire` rows, dated the day after the lot's use-by date, practice memberships left out); (c) minus, on a return day, 80% of the instant-redemption revenue of the lines returned (`thriftplus_revenue_returned`, negative). ThriftBucks taken back on a return are not revenue.
- **Tax:** tax on completed sales less tax refunded on returns.
- **Fees:** *customers paid* = card surcharge + delivery and assembly fees; *we pay* = 1% of debit card charges (`debit_card_fee_rate`, default 0.01, Settings → Store). A card or split sale with no card type is shown as **card type not set**; no fee is guessed for it.
- **Paid with:** cash, card (debit, credit, not set; the amount charged, surcharge included), payroll deduction, Thrift+ credit used, ThriftBucks from earlier visits. For sales it reconciles: cash + card + payroll + credit + earlier ThriftBucks = item sales + Thrift+ revenue from instant redemptions + ThriftBucks newly owed (kept) + tax + fees customers paid. Each response carries `reconciles.difference` (0.00); the tests check it.
- **Where it comes from:** the line's `meta['thrift_plus']` snapshot (`collected`, `instant_bucks`) and `thrift_savings`, the ThriftBucks discount line (`is_bucks_line`), `ReturnRecord` (`taxable_back`, `bucks_back`, `bucks_taken`, `shortfall`, `tax_back`), the ledger's expiry rows, and the cart's `tax_amount`, `thrift_credit`, `card_*` fields. A member line sold before snapshots existed counts at its full price. `debit_card_fee_rate` has no row until the owner first saves it: the code uses 0.01, and Settings → Store shows 1% and creates the row on the first save.
- **Worked example (W5 lamp: $80 tag, 35 ThriftBucks, 7% tax):**
  - *Kept:* pay $85.60. Item sales $45.00 (80 - 35), Thrift+ revenue $0, ThriftBucks owed 35.00, tax $5.60.
  - *Redeemed instantly (50%):* pay $62.50 + $4.38 tax = $66.88. Item sales $45.00, Thrift+ revenue $17.50 (35 - 17.50), owed 0, tax $4.38.
  - *Return of the kept lamp:* credit $68.48 (80% with tax), 28.00 ThriftBucks taken back. Returns = 64.00 - 28.00 = **-$36.00** (80% of 45.00); tax refunded $4.48. Net item sales for the lamp: $9.00.
  - *Return of the instant lamp:* credit $53.50 ($50.00 before tax), nothing to take back. Returns **-$36.00** (80% of 45.00) and Thrift+ revenue **-$14.00** (80% of 17.50) on the return day. Kept: 9.00 item sales + 3.50 Thrift+ revenue = 12.50 = 62.50 paid - 50.00 given back.
  - *A $50 vase bought with 35 earlier ThriftBucks (it collects 10):* pay $16.05. Item sales $40.00 (50 - 10), owed 10.00, tax $1.05, earlier ThriftBucks used $35.00. Its return: $12.00 credit before tax + 28.00 ThriftBucks back - 8.00 taken back = Returns **-$32.00** (80% of 40.00).

- **Quality Audit removed.** Tables dropped by **`pos.0026_drop_quality_audit`**. Floor checklists live in **`apps.routines`**. Retail metrics add `today_work_cycles`, `week_work_cycles`, and `week_idle_dismissed`; work-cycle submissions are excluded from `week_audits`.
- **Idle work-cycle prompt.** After `retail_qa.idle_prompt_minutes` (default 5) with no cart create / void / complete on that register, `WorkCyclePromptDialog` asks for a shelf or non-shelf check. Activity is stored in `localStorage` per register. Dismissals log `POST /api/routines/work-cycle/prompt/`. The Register activity pill stays as the manual entry.

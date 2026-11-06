<!-- Last updated: 2026-11-05 (Cash Drops #70 first part: the page, cover accept, handover coins optional; earlier 11-02: Cash / Card / Split, the cash window, the drawer view; a handoff count sets the drawer's bills; the opening count window) -->

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

### Cash by denomination at the register (2026-10-21, digest point 3, `pos.0043`)

- **Cash / Card / Split (Bill, 2026-11-02):** the Payment panel is three big buttons. **Card** goes straight to the card step (credit 3% / debit, as before). **Cash** and **Split** open the **cash window** (`components/pos/CashWindow.tsx`; full screen on a phone, pinned to the top so the tiles never move). Complete lives in the window. Split is cash then card: tap the cash part, then "Card for $X" goes to the card step for the rest (the surcharge is on the card part only); cash that covers it all turns the button into "Complete as cash". Backing out of the card step keeps the split's cash (Split reopens with it); Cash and the window's X start clean. Payroll (staff) is a small link under the buttons while the owner's switch is on. Thrift+ covering it all hides the three buttons (one Complete button).
- **Tap the money handed over:** big bill and coin tiles (`components/pos/CashTenderPad.tsx`): tap = one more; a tapped tile shows its count and a wide minus edge that takes one of it off (one tap to fix a wrong bill); right-click or Shift-tap also takes one back. Undo (last tap) and Clear (all). With the pad focused, keys Q W E R T Y = $100 $50 $20 $10 $5 $1 and A S D F = 25¢ 10¢ 5¢ 1¢ (Shift takes one back, Backspace undoes); the keys are not printed on the tiles. "Type the amount" is the fallback; Dash then guesses the bills (`cash_received_typed`). Words in English and Spanish by the user's language (`i18n/pos.ts`).
- **What to give back:** the window shows "Give back $2.60" and the pieces as big chips (2 × $1 · 2 × 25¢ · 1 × 10¢) from what the drawer holds; after the sale the panel keeps the server's answer for 20 seconds. Fewest pieces, largest first, or an exact search when the drawer is short of a coin (30¢ with no nickels: 3 dimes). If the drawer can't make it (Dash's contents drifted), it says so (`change_short`) and the cashier gives the same amount from what is there. Same rules on both sides: `services/cash_counts.make_change` and `utils/cashCounts.ts`.
- **Colours and oddballs (2026-11-03, #52):** every bill and coin carries its note's colour (`tone` in `CASH_DENOMINATIONS`; `CashLabel` for names), always with its label. Oddballs (`twos` $2, `halves` 50¢, `dollar_coins` $1) are valid in any count and count toward tender and totals, but `make_change` never gives them. They sit behind an Oddballs button: in the coin row of `CashTenderPad`, and as the last row of `CashCountPad` (a pop-up, so nothing moves). They are counted by hand with the bills (`drawer_life.BY_HAND`, `padKeys('bills')`): a handover and a close's hand count include them, and the coin counter never does. The till fund never holds them, so a close drops every one.
- **The drawer view:** a "Drawer $X" chip in the terminal header (and "Drawer" in the cash window) opens each bill and coin with its count and dollars (`components/pos/DrawerContentsDialog.tsx`); on the training register it reads "Practice drawer".
- **Complete** takes `cash_received` (a count); its sum is the cash tendered (a `cash_tendered` sent too must match: `CASH_MISMATCH`). The sale keeps `cash_received`, `change_breakdown` and `cash_received_typed`.
- **The drawer's contents** (`Drawer.contents`, by bill and coin) start as the opening count, take a handoff's or takeover's bill count as the bills (coins kept until the office close; 2026-11-02), gain each cash sale's money received less the change given (under a row lock), lose drops by their count, and get a void's money back out. A count can go below 0 when Dash and the drawer disagree; the closing count shows it. The training register touches no drawer.

### The safe (Retail 5 step 1, 2026-11-02, `pos.0048`, `services/safe.py`, `safe_views.py`)

- `Safe` (one per location, balance by bill and coin) and `SafeLine` (swap: pieces into and out of the safe; count: the difference). The office side of a swap is two `SupplementalTransaction` lines (`from_safe`, `to_safe`); one transaction moves both, neither goes below 0.
- Owner setting `pos.office_target` = `{count, cap}` (Cash page, owner only). Needs a swap: a bill or coin under its target, or the office total over the cap; the suggestion takes from the safe what the office lacks (as far as the safe has it) and puts in what it holds over (everything over target when over the cap). A count below 0 in the office (ledger drift) counts as none.
- `GET /api/pos/safe/` (managers, owner) feeds the Cash page's `SafeCard` and the bell row "Office cash: swap with the safe". `POST safe/swap/`, `POST safe/count/` (blind; the difference to the owner only), `PUT safe/target/` (owner).

### Bank deposits (Retail 5 step 2, 2026-11-02, `pos.0049`, `services/bank.py`)

- Bags = `CashDrop`s and close-out drops (`Drawer.close_out.drop_total`) of the last 45 days not in a deposit. A bag is a label only (its cash is already in the office); `DepositBag` (deposit, kind, ref, total; unique kind+ref) ties it to one deposit.
- `GET/POST /api/pos/bank/deposit/` (managers, owner): the open bags and pending deposits; POST {bags, count, source office|safe, note}. The count leaves the source (`SupplementalTransaction` `to_bank` or `SafeLine` `deposit`), never below 0 by piece. `BankTransaction` keeps `source`, `bags_total`, `difference` (counted - bags; past `pos.close_note_over` needs a note). Pending until Mark deposited (`bank-transactions/<id>/complete/`, idempotent). The old CRUD refuses create (`USE_SAFE_CARD`) and edit/delete of a row that moved cash (`LOCKED`).
- Change from the bank (step 3, `pos.0050`): `POST /api/pos/bank/change/` {count, into office|safe}: `BankTransaction` change_pickup, completed, plus `from_bank` or `SafeLine` `change`; taken as paid from the bank account (no cash out).

### A drawer's life (2026-10-22, digest point 3, REG-18/19, `pos.0044`, `services/drawer_life.py`)

- **The count window (Retail 4, 2026-11-02):** `components/pos/CountWindow.tsx` + `CashCountPad.tsx`: one big row per bill and coin (−, the number, +; typing works), the button carries the total ("Open drawer · $160.00"), a double tap posts once, an error keeps the count. After the count the same window shows Right on, or Short / Over and only the bills and coins that are off (`CountResult`). Used for the opening count (terminal and Drawers page) and the handover (Drawers page: who takes it in the window's top slot, bills only, the drawer's cashier cannot be picked); the spot check after a cover (`RegisterCover`: cover-back answers `spot_check` with what the cover moved, from its cash sales, drops and paid in/out, `services/cover.changed`; `POST /pos/drawers/<id>/spot-check/` {cover, count} counts just those keys, worked out on the server, once per cover, the drawer's cashier or a manager, logged as `RegisterEvent` `spot_check` with `cover` and `amount`, blind in the timelines while open); and the close (Drawers page: bills in the pad; coins as the counter total or by coin and the note, NOTE_REQUIRED, in the top slot; set-aside sales still asked first; the result big, Expected beside Counted (#26); then `CloseOutGuide` from `close_out`: `drawer_life.close_out` keeps the whole till for tomorrow, `from_office` the pieces the count lacks, `give_back` the dollars back to the office from the rest, the drop the rest by piece, coins in dollars when from the counter; saved on `Drawer.close_out`, shown in the Drawer window; the office ledger is unchanged).

- **Blind counts.** Opening, handoff and close are counted without seeing what Dash expects. The answer after the count (`count_check` on the response) shows counted, expected and the difference by bill and coin (`components/pos/CountCheckDialog.tsx`). Opening is checked against the register's till fund (`Register.starting_breakdown`; none set, no check). A cashier's Drawers card hides the running cash sales while the drawer is open.
- **Handoff and takeover count the bills** (Bill, 10-21), and the coins too when counted (#70, see Handover coins); expected = the bills in `Drawer.contents` (all of it with coins). The handoff keeps `bills_only` and `expected_count`.
- **Expected cash** = opening + cash sales - drops + paid in - paid out.
- **Paid in / paid out** (`CashMovement`, `POST /pos/drawers/{id}/paid-in/` and `/paid-out/`, `{amount, total, reason}`): money in or out that is not a sale or a drop; a reason is required; the drawer's contents follow. Not on the training register or a closed drawer.
- **Drops need a reason** (`CashDrop.reason`) and go into the office.
- **The office close** (`close`): bills by hand plus the coins by coin or the coin counter's total (`coins_total`, one row; not both). More than the owner's `pos.close_note_over` off (Settings → Store → Register money, default $5) needs a `note` (400 `NOTE_REQUIRED`, which does not say by how much). Only the drawer's cashier or a manager closes it (403 `NOT_YOUR_DRAWER`). The drawer keeps `closing_expected`, `coin_counter_total`, `close_note`.
- **The cash chain into the office ledger** (`SupplementalTransaction`): the till leaves the office at opening (`drawer_open`), drops go in (`drop`), and everything counted at the close goes in (`drawer_close`); the office's total and bills/coins move with each. Nothing for the training register or when no supplemental drawer is set up.

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
- `drawer` (FK), `amount` (JSONField), `total`, `dropped_by`, `notes`, `reason` (required since 2026-10-22)
- Endpoint: `POST /pos/drawers/{id}/drop/`

## BankTransaction

- Types: `deposit`, `change_pickup`
- Status: `pending`, `completed`
- Fields: `amount` (JSONField), `total`, `performed_by`, `completed_at`, `notes`
- **Permission**: `IsManagerOrAdmin`
- Endpoints: CRUD + `PATCH /pos/bank-transactions/{id}/complete/`

## Drawer Close Flow

When closing a drawer (`POST /pos/drawers/{id}/close/`):

1. **Expected cash** = `opening_total + cash_sales_total - drops + paid in - paid out` (`drawer_life.expected_cash`). `cash_sales_total` grows by each cash sale's amount due (the change handed back is never in it) and is added in the database, so two sales at once both count.
2. **Variance** = `closing_total - expected_cash`
3. Drawer is marked closed with `closing_count`, `closing_total`, `expected_cash`, `variance`

Cash drops are taken from the drawer during the shift; the close compares the physical count to opening + sales. The count is blind and goes into the office ledger: see "A drawer's life" above.

## Cash Drops page (`/pos/cash`, `CashManagementPage.tsx`; #70, Bill 2026-11-04)

Retail → Managers, managers and the owner. In order:
- **Cash drop box:** every envelope waiting for the bank (`GET /pos/bank/deposit/` bags: a `CashDrop` or a close-out drop), its register, time, total and bills (`describeCount`); the box's total. Read only: the deposit is made on the safe card.
- **The safe** (`SafeCard`): swap, count, Bank deposit, change from the bank, Mark deposited.
- **Office drawer** (the `SupplementalDrawer`): total, last count, **Recount** (`CountWindow` → `supplemental/audit/`), the last 10 ledger lines in plain words.
- **Bank history:** read only. The old Draw / Return buttons (they moved `current_total` but not `current_balance`), the bank Edit / Delete and the dead create form are gone; `supplemental/draw|return` and the bank CRUD stay on the server, unused by any screen.

### Still to build (#70 later part; it changes how cash is booked, so it waits for the owner's review)
The plan in `cash-drops-decisions.md` (main checkout `.ai/extended/`) also has: the office drawer only swapping with the safe at a fixed total (today opening, drops and the close post into it), the close's exchange with the office recorded (today `CloseOutGuide` is advice only), the close-out drop as an envelope of its own, the deposit split ($20s and $10s to the bank, small bills to the safe), a count on the terminal's Take over, and the counting parts of Drawers moving here.

### Cover: take it on, and accept it back (#70)
- `POST drawers/{id}/cover/` needs `accept: true` (400 `ACCEPT_NEEDED`): the one covering ticks "I take this drawer while I cover".
- `cover-back` answers `cover_report` (`services/cover.report`): the cash sales finished under the cover, the drops and paid in / out meanwhile, and `changed` by bill and coin. `RegisterCover` shows them; with something changed the blind spot check counts just those, then **Accept the drawer**; with nothing changed, a window with Accept only. It cannot be dismissed. `POST drawers/{id}/cover-accept/` {cover} logs `RegisterEvent` `cover_accepted` once (the drawer's cashier or a manager; `pos.0051`).

### Handover coins (#70)
- A handoff or takeover count may include the coins (`with_coins`, or any coin in the count): then it is checked against the whole drawer, `bills_only` is false and the coins become the drawer's coins (`_handoff_count`, `_expected_for`). Without coins, as before. The Drawers page's handover window has "Count the coins too (you can skip them)".

## Permissions

- **Supplemental operations** (draw, return, audit): Manager+ only
- **Bank transactions** (create, complete): Manager+ only
- **Cash drop**: Any authenticated employee (via DrawerViewSet)
- **Drawer close**: Any authenticated employee
- **Drawer record edit/delete** (`PATCH`/`PUT`/`DELETE /pos/drawers/{id}/`): Manager+ only (2026-10-21, REG-01). Every drawer field is read-only in `DrawerSerializer`, and a drawer with sales, drops or handoffs cannot be deleted (409 `DRAWER_HAS_RECORDS`). Drawers change only through their actions.

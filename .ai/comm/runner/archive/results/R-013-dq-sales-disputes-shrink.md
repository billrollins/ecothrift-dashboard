# R-013 · Data quality: sales, disputes, shrink, inventory counts
- **Runner:** Grok 4.7 · **Started:** 2026-09-23 13:20 CT · **Finished:** 2026-09-23 13:34 CT · **Status:** done

Dev database, read-only, as of **2026-09-23 13:26 CT**. Store hours used below are `AppSetting` `online_sales.hours`: America/Chicago, open 09:00, close 18:00, `closed_weekdays` `[0, 6]` (Monday and Sunday). Queries: `workspace/runner/R-013/query.py` through `query5.py`.

There is no POS refund model and no `Item` status `returned` in the data (0 rows). A void puts the item back on the shelf. A customer return, when it is recorded, is a negative discount line and leaves `Item.status` alone.

---

## 1. Rails today

### `pos.Cart` (`apps/pos/models.py:183-231`)

75,931 rows. Row inserts start **2026-04-06**. `completed_at` values start **2023-02-21** (imported sale times on rows inserted later).

| Field | What sets it | First filled | All-time fill | Last 90 days (row `created_at`) |
|---|---|---|---|---|
| `status` | `complete` sets `completed` (`pos/views.py:1485`); `void` sets `voided` (`pos/views.py:1545`) | 2026-04-06 | 100% (75,931) | 100% of 4,040 |
| `payment_method` | `complete` (`pos/views.py:1477`) | 2026-04-06 | 100% | 100% |
| `subtotal`, `tax_amount`, `total` | `Cart.recalculate` (`pos/models.py:242-249`) | 2026-04-06 | 100% (defaults included) | 100% |
| `completed_at` | `complete` (`pos/views.py:1486`) | value 2023-02-21 | 75,854 / 75,931 = **99.9%** | 4,017 / 4,040 = **99.4%** |
| `cash_tendered` | `complete` (`pos/views.py:1478`) | UNKNOWN (min `created_at` of rows that have it was not separate from the 2026-04-06 insert era) | 1,726 / 75,931 = **2.3%** | 1,002 / 4,040 = **24.8%**. Every completed cash cart created in the last 90 days has it (999 / 999) |
| `change_given` | `complete` (`pos/views.py:1479`) | never | **0 / 75,931** | **0 / 4,040** |
| `card_amount` | `complete` (`pos/views.py:1480`) | in the insert era; sparse until recently | 4,808 / 75,931 = **6.3%** | 3,016 / 4,040 = **74.7%**. Every completed card cart created in the last 90 days has it (3,012 / 3,012) |
| `card_type` | `complete` (`pos/views.py:1481`) | `completed_at` **2026-09-09** | 357 / 75,931 = **0.5%** | 356 of 3,013 card sales whose `completed_at` is in the last 90 days (**11.8%**) |
| `customer_id` | model field (`pos/models.py:205-207`); `complete` does not set it | never | **0 / 75,931** | **0** |

Status: completed 75,848, voided 44, open 39. Completed payment method: card 53,091, cash 21,649, split 1,108.

### `pos.CartLine` (`apps/pos/models.py:252-287`)

238,628 rows. Inserts start **2026-04-06**.

| Field | What sets it | First filled | All-time fill | Last 90 days (`created_at`) |
|---|---|---|---|---|
| `item_id` | `add-item` (`pos/views.py:706-716`). Manual, discount, delivery, and assembly lines set it null (`pos/views.py:851-858`, `1068-1075`) | item lines 2026-04-06 | 175,865 / 238,628 = **73.7%** | 14,658 / 14,990 = **97.8%** |
| `line_kind` | same creators. Default `item` | 2026-04-06 | 100% | 100% |
| `quantity`, `unit_price`, `line_total` | creators; `save` recomputes `line_total` from `sale_percent` (`pos/models.py:306-309`) | 2026-04-06 | 100% | 100% |
| `sale_percent`, `sale_label` | `apply_sale_to_line` (`pos/services/sale_mode.py:128-170`). Summer is 50% (`sale_mode.py:15`) | a percent above 0: **2026-09-07** | stored on every row (default 0). Above 0: **1,433** lines | all 1,433 are in this window |
| `description` | creators | 2026-04-06 | column is non-null. Blank count UNKNOWN | UNKNOWN |

`line_kind` counts: item 175,865 (all have an item), manual 62,748 (none have an item), discount 12, delivery 2, assembly 1.

### Returns, refunds, voids

| Path | Where | What it does to `Item.status` |
|---|---|---|
| Void | `CartViewSet.void` (`pos/views.py:1541-1557`) | Cart becomes `voided`. If `item.status == 'sold'`, status becomes `on_shelf` and `sold_at` / `sold_for` are cleared. No `ItemHistory` row. Consignment is not updated here (it is set sold at `pos/views.py:1522-1530`). |
| In-store return | `CartLine` `line_kind='discount'`, `meta.reason` = `In-store credit (return)` (`pos/views.py:1055-1075`) | **No.** The line has no item. 7 completed lines, **−$516.20**. |
| `Item.status = 'returned'` | choice at `inventory/models.py:1788`. Legacy map only (`import_legacy_data.py:119`). No live writer | **0 rows** |
| Web checkout refund | `Order.payment_status` includes `refunded` (`webstore/models.py:533`). `checkout` rejects creates (`webstore/views.py:1044-1053`) | **0 orders**, 0 order lines |
| Parts-purchase refund | `RestorationPartsOrder.refunded` (`inventory/models.py:1475`) | Not a customer return. 1 row, `refunded` false |

Voided carts: 44. Of items that appear on a voided line: 60 are `sold` and also have a completed line; 26 are `on_shelf` and have no completed line; 2 are `on_shelf` and also have a completed line; 1 is `scrapped` with no completed line.

### `inventory.Item` sale, loss, scrap, dispute (`inventory/models.py:1783-1888`)

237,689 items. There is no `channel`, no cash-back field, no `lost_at`, and no scrap-date column.

| Field | What sets it | First filled | All-time | Last 90 days |
|---|---|---|---|---|
| `status` | POS `complete` sets `sold` (`pos/views.py:1502`). Void sets `on_shelf` (`pos/views.py:1554`). Scrap: `mark_broken` (`inventory/views.py:7992`), bulk broken (`views.py:6080`), batch scrap (`views.py:7062`). Lost: processing dispute (`processing_ops.py:2073`, `2158`). A generic item PATCH can set `status` (`ItemSerializer` `serializers.py:855-877`; manage drawer includes `sold`, `ItemManageDrawer.tsx:84` and `:230-236`) | row inserts from **2026-03-30** | 100% | 100% of 27,560 items created in the window |
| `sold_at` | `complete` (`pos/views.py:1503`). Workbench mark-sold sends it (`ItemWorkspacePanel.tsx:72-75`). Cleared by void and by mark-on-shelf (`views.py:8312-8314`). v1 backfill writes status `sold` with `sold_at` left null (`backfill_phase3_items.py:487-512`) | value **2024-03-18** | 122,220 / 237,689 = **51.4%** of items; **122,220 / 122,617 = 99.7%** of `status=sold` | of items created in the window: 7,073 / 27,560 = **25.7%**. Of those created-in-window and `status=sold`: 7,073 / 7,448 = **95.0%** |
| `sold_for` | `complete`: `line_total / quantity` (`pos/views.py:1505`) | same rows as `sold_at` (122,220 non-null) | same 99.7% of sold rows. **791** of those are 0 | of sales with `sold_at` in the window (14,595): **100%** non-null, **25** are 0 |
| `dispute_type` | processing dispute (`processing_ops.py:2069`, `2074`, `2151`, `2159`). Cleared on check-in (`processing_ops.py:1824`) | item `created_at` **2026-05-01** (item birth, not a dispute stamp). `Dispute.opened_at` starts **2026-05-18** | **162 / 237,689 = 0.07%** non-blank | **0** of 27,560 items created in the window |
| `dispute_pct_loss` | broken path, stored as 100 (`processing_ops.py:2070`, `2152`) | with those 14 broken rows | **14** | 0 created in the window |
| `dispute_description` | broken path (`processing_ops.py:2071`, `2153`) | with those 14 | **14** | 0 created in the window |

`status` counts:

| status | n | first `created_at` |
|---|---:|---|
| sold | 122,617 | 2026-03-30 |
| scrapped | 83,506 | 2026-04-12 |
| on_shelf | 31,128 | 2026-03-30 |
| intake | 290 | 2026-05-02 |
| lost | 148 | 2026-05-01 |
| returned | 0 | |

`ItemHistory` has no `sold` event. POS complete does not write one. `status_change` to `lost`: 148, first **2026-05-01**. `status_change` to `scrapped`: 14, first **2026-05-01**. The other 83,492 scrapped rows have no scrap history.

### `inventory.Dispute` and PO rollups

`Dispute` (`inventory/models.py:2459-2537`) is created by `create_dispute` (`disputes.py:61-76`) and by `record_processing_dispute_for_items` (`disputes.py:107-138`). PO `intake_dispute_status` / `processing_dispute_status` (`models.py:204-213`) are recomputed in `disputes.py:23-29`.

162 rows, all `kind=processing`, all `status=open`, all with a title and a `subject_item`. `opened_at` **2026-05-18** through **2026-05-28**. **0** opened in the last 90 days. `description` filled on **14 / 162**. `resolved_at` on **0**. Payload keys: `source`, `dispute_type`, `dispute_pct_loss`, `dispute_description`, `item_ids`. No credit amount.

PO rollup: 342 of 349 are `none` / `none`. **7** are `processing_dispute_status=active`. **0** intake disputes.

`dispute_type` on items (the only non-blank values):

| dispute_type | status | n | pct_loss |
|---|---|---:|---|
| undelivered | lost | 148 | null |
| broken | scrapped | 14 | 100 on all 14 |

Choice values with **0** rows: `missing_pieces`, `cosmetic_damage`, `missing_critical_piece`, `bad_condition`, `other` (`models.py:1862-1877`).

### Webstore orders and reservations

| Model | Rows | What sets the sale-shaped fields | First date | Fill |
|---|---:|---|---|---|
| `webstore.Order` (`models.py:518-561`) | **0** | Checkout is rejected (`views.py:1044-1053`) | — | — |
| `webstore.OrderLine` | **0** | | — | — |
| `webstore.Reservation` (`models.py:240-323`) | **1**, status `expired` | `complete_reservation` would set `completed` and can set the listing `sold` (`reservations.py:475-491`). POS calls it from `pos/views.py:1508-1517` | 2026-09-06 | `item_id` 0/1, `pos_cart_id` 0/1, `completed_at` 0/1 |
| `webstore.WebListing` | **1**, status `published` | listing `sold` at `reservations.py:490` or `webstore/views.py:232` | 2026-09-01 | `item_id` 0/1 |

Sold items in the last 365 days with a completed reservation: **0**. `WebListing.return_policy` (`models.py:48-51`) is a policy flag, not a recorded return.

### Counts

`routines.Section` is a name and an owner, not an inventory link (`routines/models.py:9-14`). No model in `apps/routines` points at `inventory.Item`.

`SectionObservation` (`routines/models.py:447-482`) stores section-level counts: `items_inspected`, `count_facing`, `count_reshelf`, `count_reprep`, `count_security`.

| kind | n | first `observed_at` | last 90 days | items_inspected | facing | reshelf | reprep | security |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| tally | 4 | 2026-09-22 16:52 CT | 4 | 0 | 13 | 5 | 7 | 0 |
| audit | 3 | 2026-09-22 16:53 CT | 3 | 0 | 0 | 1 | 7 | 0 |

Routines present: Section check (`section_tally`), Cross-check (`section_audit`), Spot walk, Register activity, Opening / Midday / Closing, Pull B-Stock manifests. `PurchaseOrder.est_shrink` (`inventory/models.py:219-231`) is a planning fraction, default 0.15, not a count.

---

## 2. Register rows rechecked

| ID | Verdict | Fresh count |
|---|---|---|
| SAL-01 | **confirmed** | No channel field. Fixed R-004 window (`sold_at` ≥ 2025-09-23 17:57 UTC): **55,008 of 55,012** sold items have a completed POS line. Rolling 365 days: **54,994 of 54,998**. Completed web reservations in that year: **0**. Web orders: **0**. |
| SAL-02 | **confirmed** | No cash-back or realized-price field on `Item`, `Cart`, or `CartLine`. `sold_for` is `line_total / quantity` after `sale_percent`. |
| SAL-03 | **confirmed** | The swing is still there. America/Chicago months: **Oct 2025 is 10,995 units** ($132,978.10) and **Apr 2026 is 1,552** ($17,809.70). R-004's 11,010 was the UTC cut of October. Sep 2026 is 3,348 units through the 22nd. |
| SHR-01 | **confirmed** | **11,017** on-shelf items with `listed_at` older than 90 days, retail **$416,459.29**. All 31,128 on-shelf items have `listed_at`. **0** are older than 180 days. |
| SHR-02 | **confirmed** | No item-level count and no measured shrink. The section walks in the table above do not name items. |

America/Chicago month buckets since 2025-03-24 (March 2025 and September 2026 are partial):

| Month | units | revenue |
|---|---:|---:|
| 2025-03 | 931 | 15,922.25 |
| 2025-04 | 4,063 | 78,831.69 |
| 2025-05 | 5,147 | 85,620.34 |
| 2025-06 | 4,439 | 71,367.44 |
| 2025-07 | 3,148 | 45,826.29 |
| 2025-08 | 909 | 17,094.65 |
| 2025-09 | 4,044 | 61,988.61 |
| 2025-10 | 10,995 | 132,978.10 |
| 2025-11 | 8,214 | 116,517.88 |
| 2025-12 | 5,428 | 52,563.24 |
| 2026-01 | 2,194 | 34,885.71 |
| 2026-02 | 2,749 | 47,287.97 |
| 2026-03 | 1,614 | 27,226.81 |
| 2026-04 | 1,552 | 17,809.70 |
| 2026-05 | 2,574 | 41,835.70 |
| 2026-06 | 4,470 | 35,832.21 |
| 2026-07 | 6,044 | 65,103.86 |
| 2026-08 | 4,041 | 46,590.82 |
| 2026-09 | 3,348 | 32,226.40 |

Scrapped is still **83,506** (ITM-06). **83,491** have notes starting `BACKFILL:`. **14** have `dispute_type=broken`. **0** have `sold_at`.

---

## 3. Checks

Denominators: 122,617 `status=sold`. **14,595** of those have `sold_at` in the last 90 days.

| Check | All-time | Last 90 days of `sold_at` |
|---|---|---|
| `sold_for` null | 397, and `sold_at` is null on the same 397 | 0 |
| `sold_for` = 0 | 791 (737 `BACKFILL:` notes, 54 others). All 791 have a completed cart line | 25 |
| `sold_for` &gt; `retail` (`retail` &gt; 0) | 39 | 15 |
| `sold_for` &gt; current `price` (`price` &gt; 0) | 12,144. Median price $8.99, median `sold_for` $11.76, median ratio **1.292**. By `sold_at` year: 2024 = 71, 2025 = 12,063, 2026 = 10 | 4 |
| `sold_at` in the future | 0 | 0 |
| `sold_at` at local midnight | 0 | 0 |
| `sold_at` on Sunday or Monday | 25,774 of 122,220 | Monday **346**, Sunday **0** |
| Open day, local time before 09:00 or at/after 18:00 | 25,684 | **683**, all in the 18:00 hour |
| Inside Tue–Sat 09:00–18:00 | | **13,566** |

The 346 Monday sales in the last 90 days fall from 09:00 through 18:00 (peak 16:00, 75 sales), so they are daytime sales on a day the hours setting marks closed.

**Sold with no completed cart line:** 401. Of those, 397 are the null `sold_at` / `sold_for` rows (375 notes are not `BACKFILL:`, 22 are). The other **4** have `sold_at` on 2026-07-15 15:45 UTC and `sold_for` from $1.25 to $4.00, and no `BACKFILL:` note.

The 375 non-backfill nulls were created across 2026-06-29 through 2026-09-18 (peaks: Aug 25 = 70, Aug 27 = 54, Aug 21 = 46, Sep 17 = 37, Sep 18 = 35). Each has one history row, `status_change` to `on_shelf`, and no cart line. `ItemSerializer` accepts `status` without `sold_at` (`serializers.py:855-877`). POS complete and the workbench mark-sold button both write `sold_at`. Which client set these 375 is UNKNOWN; the history does not say.

**Cart lines with no item**, completed carts:

| line_kind | n | sum of `line_total` | last 90 days of `completed_at` | sum in that window |
|---|---:|---:|---:|---:|
| manual | 62,741 | $711,868.58 | 311 | $3,558.89 |
| discount | 11 | −$533.70 | 11 | −$533.70 |
| delivery | 2 | $125.00 | 2 | $125.00 |
| assembly | 1 | $70.00 | 1 | $70.00 |

**Duplicate sales of one item**

- More than one completed cart: **8,906** items. **8,903** have `BACKFILL:` notes (8,368 on different days, 535 on the same day, 3,992 on 3 or more carts). **3** do not, all on the same day.
- `quantity` &gt; 1 on a completed item line: **8,622** lines (max quantity 368). **230** with `completed_at` in the last 90 days are not `BACKFILL:` items; **2** are. `add-item` increments quantity when the SKU is already on the open cart (`pos/views.py:694-698`). `sold_for` then stores the unit price (`pos/views.py:1504-1505`), so the cart charged `quantity` times and the item records one sale.

**Discounts over 50%.** `sale_percent` &gt; 50 on a completed line: **0**. Exactly 50: **150** lines, `sale_label=summer`, first **2026-09-07**. Between 1 and 49: **1,268**, all `labor_day`, same day. Discount lines over half the pre-discount merchandise: **6**, all `In-store credit (return)`. **2** of the discount lines are at least the whole pre-discount amount. Google Review: 4 lines, −$17.50, none over half.

**On shelf with `sold_at`:** **0**. On shelf with `sold_for`: **0**. On shelf with a completed cart line: **43**, all with `sold_at` and `sold_for` null, none `BACKFILL:`, carts completed **2026-04-07** through **2026-08-25** (20 of those lines in the last 90 days). Their history is create / check-in to `on_shelf`, not a later return from sold.

**On-shelf age** since `listed_at`, America/Chicago clock, as of this read. Buckets: 0–30 is `listed_at` within 30 days; 31–90 is older than 30 and within 90; 91–180 is older than 90 and within 180; 180+ is older than 180. No on-shelf item has a null `listed_at`.

| Category | n | 0–30 | 31–90 | 91–180 | 180+ |
|---|---:|---:|---:|---:|---:|
| Mixed lots & uncategorized | 8,265 | 184 | 270 | 7,811 | 0 |
| Apparel & accessories | 6,113 | 1,980 | 3,247 | 886 | 0 |
| Kitchen & dining | 2,648 | 2,063 | 510 | 75 | 0 |
| Party, seasonal & novelty | 2,513 | 1,566 | 931 | 16 | 0 |
| Health, beauty & personal care | 2,010 | 979 | 371 | 660 | 0 |
| Office & school supplies | 1,248 | 453 | 749 | 46 | 0 |
| Electronics | 1,166 | 560 | 572 | 34 | 0 |
| Tools & hardware | 1,114 | 45 | 435 | 634 | 0 |
| Sports & outdoors | 1,015 | 305 | 613 | 97 | 0 |
| Household & cleaning | 992 | 587 | 195 | 210 | 0 |
| Home décor & lighting | 987 | 601 | 363 | 23 | 0 |
| Bedding & bath | 786 | 159 | 587 | 40 | 0 |
| Toys & games | 732 | 300 | 239 | 193 | 0 |
| Pet supplies | 408 | 94 | 182 | 132 | 0 |
| Baby & kids | 360 | 203 | 126 | 31 | 0 |
| Outdoor & patio furniture | 339 | 3 | 263 | 73 | 0 |
| Storage & organization | 233 | 83 | 145 | 5 | 0 |
| Books & media | 119 | 55 | 14 | 50 | 0 |
| Furniture | 80 | 35 | 44 | 1 | 0 |
| **All on shelf** | **31,128** | **10,255** | **9,856** | **11,017** | **0** |

The 11,017 in SHR-01 are this 91–180 column. Nothing now on the shelf was listed more than 180 days ago.

---

## 4. Counts and the shrink gap

Nothing in the database records a physical inventory count, a per-item "not found", or a routine tally tied to an item.

What exists: four section tallies and three cross-checks, all on 2026-09-22, with facing / reshelf / reprep / security totals and `items_inspected` = 0. Lost (148) and scrapped (83,506) are item statuses. The 148 lost rows have a dispute type and a history timestamp. The scrapped majority has neither a reason nor a history row. `est_shrink` is an estimate on the PO.

A Monday floor count would have to record which item was looked for, the date, and whether it was found or missing, so the missing ones can leave "on shelf" and be summed as shrink. Today a walk records how many problems a person saw in a section. It cannot change have, and it cannot be subtracted from the 11,017 long-listed units.

---

## 5. New register rows

Scope is this dev database, as of 2026-09-23.

| ID | Stage | Issue | Scope | Affects | Handling | Rail | Status |
|---|---|---|---|---|---|---|---|
| SAL-04 | sales | `status=sold` with `sold_at` and `sold_for` both null | 397 items. 375 are not `BACKFILL:` (created 2026-06-29 through 2026-09-18, no cart line, only an on-shelf history row). 22 are v1 backfill (`backfill_phase3_items.py:511-512`) | Unit counts, recovery, days to sell | **exclude** from sales rates | A write that sets `status=sold` also sets `sold_at` and `sold_for`. The item PATCH allows status alone (`serializers.py:855-877`) | open |
| SAL-05 | sales | `sold_for` is 0 | 791 sold items, every one on a completed cart line. 737 are `BACKFILL:`. 25 have `sold_at` in the last 90 days | Price and recovery | **flag**; **exclude** 0 from averages | A $0 item line stores a reason | open |
| SAL-06 | sales | `sold_at` set and no completed cart line | 4 items, `sold_at` 2026-07-15 15:45 UTC, `sold_for` $1.25–$4.00 | POS tie-out | **flag** | A sold item has a completed cart line | open |
| SAL-07 | sales | Completed sales with no item (misc) | Manual lines: 62,741, **$711,868.58**. Last 90 days: 311 lines, **$3,558.89**. Also 11 discount, 2 delivery, 1 assembly | Any total that only sums `Item.sold_for` | **use** as misc, beside item sales | `line_kind` already separates them (`pos/models.py:263-274`) | open |
| SAL-08 | sales | One item on more than one completed cart | 8,903 `BACKFILL:` items (8,368 on different days; 3,992 on 3+ carts). 3 other items, all same day | Units, if each line is counted as a sale; `sold_for` holds one price | **flag**. For those backfill items, count cart lines | A second completed sale of an item has a void of the earlier cart in between. `add-item` already blocks a SKU that is already `sold` (`pos/views.py:595-613`) | open |
| SAL-09 | sales | Item line `quantity` &gt; 1 | 8,622 completed item lines (max 368). Last 90 days: **230** on non-backfill items, 2 on backfill items | Revenue (the cart charges quantity; the item stores one unit price) | **flag** | A second scan of a SKU already on the cart does not increment quantity (`pos/views.py:694-698`) | open |
| SAL-10 | sales | `sold_at` outside the posted hours | Last 90 days: **346 on Monday**, 0 on Sunday, **683 in the 18:00 hour**, 0 before 09:00, 0 in the future. All-time: 25,774 on Sunday or Monday and 25,684 outside 09:00–18:00 on an open day, of 122,220 | Hour-of-day reports | **use** the timestamp. **flag** Monday | The 18:00 hour is after the posted close (`hours.py:13-18`). Monday is a closed weekday in that setting | open |
| SAL-11 | sales | `sold_for` above `retail` | 39 sold items with `retail` &gt; 0. **15** with `sold_at` in the last 90 days | Recovery above 1 | **flag** | Checkout flags a unit price above retail | open |
| SAL-12 | sales | `sold_for` above the item's current `price` | 12,144. `sold_at` in 2025: 12,063. In 2026: 10. Last 90 days: 4. Median `sold_for` / `price` = 1.292 | Anyone treating `Item.price` as the price that was charged | **use** `sold_for` (and `CartLine.unit_price`) as the sale price | `price` is the current tag, not a sale snapshot | open |
| SAL-13 | sales | A return is a discount line with no item, and it does not change `Item.status` | 7 completed lines, reason `In-store credit (return)`, **−$516.20**. 6 are more than half the pre-discount merchandise. `sale_percent` &gt; 50: **0** lines. Exactly 50%: 150 summer-sale lines since 2026-09-07 | Returns, net sales | **use** as store credit. **flag** that the item is unnamed | A return names the item. Void remains the path that puts an item back (`pos/views.py:1551-1557`) | open |
| DSP-01 | disputes | Disputes in use are `undelivered` and `broken` only; no credit; none resolved | `undelivered` 148, all `lost`. `broken` 14, all `scrapped`, `pct_loss` 100. 162 `Dispute` rows, all processing, all open, opened 2026-05-18 to 2026-05-28, **0** in the last 90 days. 7 POs have `processing_dispute_status=active`. Intake disputes: 0. Other choice values: 0 | Vendor credit, why something was lost or scrapped | **use** the 162 as open processing disputes. Credit is **unknown** | A dispute stores the credit and a resolved date (`disputes.py:80-90` can resolve; nothing here has) | open |
| SHR-03 | inventory | On the shelf, and also on a completed cart, with `sold_at` null | **43** items, none `BACKFILL:`, carts completed 2026-04-07 through 2026-08-25. On shelf with `sold_at` set: **0** | Have (these 43 still count as stock) | **flag** | Completing a cart marks the item sold. The way back to the shelf is a void | open |
| SHR-04 | shrink | Lost items have no loss date on the item | **148**, all `dispute_type=undelivered`. The date is only `ItemHistory` `status_change`, first 2026-05-01 (`processing_ops.py:2073-2087`). No `lost_at` column. Scrap dates stay ITM-06 (83,506 scrapped, 14 with a history row) | When a loss happened | **unknown** except that history row | A loss stamps a date and a reason on the item | open |

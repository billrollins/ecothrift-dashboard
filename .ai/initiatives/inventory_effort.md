<!-- initiative: slug=inventory-effort status=active updated=2026-10-06 -->
<!-- Last updated: 2026-10-06 -->

# Initiative: Inventory effort, reports and shrink

**Status:** **Active** — Phases 1 to 6 and the no-errors rule live (v2.133.0 to v2.140.0); Phase 7 (data quality from the count) next.

**Objective:** The owner runs one inventory over as many days as it takes, and every run, scan and fix belongs to it. When it ends he has one clean report (totals, who counted what, breakdowns by any dimension), a worklist that turns "not counted" into explained outcomes (back stock, owner took, sold as generic, shrink), one-scan fixes for every problem item, and an "if it all sells" profit view of his orders. The data errors the count exposed get listed and fixed.

**Compass:** this file is not the compass; Thrift+ Rewards stays the compass. It is the owner's current operations priority (2026-10-06).

**Builds on:** [`inventory_count`](./inventory_count.md) (the count app, `apps/stocktake`), [`intake_updates`](./intake_updates.md) (Orders numbers, vendor merge Request #11).

---

## Where it stands (production, read 2026-10-06)

- **The midnight split:** a count is one per calendar day (`InventoryCount.day`, unique; `ensure_day_count` uses `timezone.localdate()`). The 10-05 count ran 11:18 AM to 12:17 AM. At midnight the next scan started count **15 (10-06)**: 10 runs, 1,964 items. One Carrie run is still open in it. Count 14 (10-05) has 75 runs and 18,002 items.
- **Coverage:** 19,964 distinct items counted out of 31,876 `on_shelf`. 11,930 were not counted: $122,475 at price, $345,696 retail.
- **Where the uncounted sit:**
  - `WLMRT-O99-8G11`: 4,332 items.
  - `WLMRT-OJU-3V74`: 2,367 items.
  - No order (legacy items): 2,229.
  - Then a long tail of 50 to 360 per order.
  - The two Walmart loads look like back stock, not theft.
- **Who counted:** Bill (47 runs), Carrie (30, two marked bad), Michael (8).
- **Problems found:** 208 items went into PR carts. **None are fixed yet.** By kind:
  - already sold: 198 (93 in carts);
  - already scanned: 640 (77 in carts);
  - not on shelf per system: 72;
  - not our tag: 197;
  - price high: 2; bad tag: 2.
- **Data on counted items:**
  - 412 have no retail.
  - 5 are priced above retail.
  - 2,657 have no order.
  - 18 were sold since they were counted. Normal: the store is open.

---

## Finish line

On **Inventory → Run count → Efforts**, the owner opens the October 2026 effort. He sees:

- the totals and the per-person breakouts;
- breakdowns by any dimension (pie, bar or 1% histogram);
- a shrink worklist where every uncounted item has an outcome;
- shrink rates by order, vendor and category.

**PR Fix-it** clears every problem item with one scan and at most one tap. **Orders → If it all sells** shows the hypothetical profit per order with a date range, quick 100% / 50% / custom, and a total line.

---

## Out of scope

- Anything in POS or checkout. Nothing here touches selling. Deploys restart the web dynos for a few seconds, so they go out after close unless the owner says otherwise.
- Real shelf locations per item (beyond a `Back stock` location value). Per-section expected counts stay "last time's count".
- A PDF generator. The report prints cleanly from the browser and exports CSV.
- Re-pricing or markdown rules. The profit view only applies a % to today's prices.

---

## Decisions (Claude's calls; the owner can change any)

1. **One effort, not one day.** `InventoryCount` becomes the effort. It stays open across days until a manager presses **Close inventory**. Its `day` is kept as the start day. The unique "one per day" rule goes.
2. **Merge the split.** Count 15 (10-06) is merged into count 14 (10-05), one undoable Request:
   - Runs, scans and issues move to count 14.
   - An item counted on both days keeps its first scan as `ok`; the later one becomes `already`.
   - Carrie's open run is stopped at its last scan.
3. **Sold during the effort is not shrink.** "Expected" = items on the shelf when the effort started, minus items sold or scrapped since, plus items checked in since. Today's sales never look like theft.
4. **What each shrink outcome does.** Each is a record first: who, when, note, undoable. Item status changes only at **Close inventory**, through one Request.
   | Outcome | Item at close |
   |---|---|
   | **Back stock** | stays `on_shelf`, `location = 'Back stock'`, so the next count expects it in the back |
   | **Owner took** | `lost`, reason `owner_use` (kept out of the theft numbers) |
   | **Sold as generic** | `sold`, `sold_for` empty, reason `sold_generic` (the till already took the money as a generic sale; no double count) |
   | **Shrink: stolen / broken / scrap** | `lost` (stolen) or `scrapped` (broken, scrap), reason kept |
   | **Found** | rescanned later or claimed in PR Fix-it; leaves the list by itself |
5. **Charts are one panel, not many pages.** A Breakdown panel with three choices:
   - **Group by:** category, subcategory, vendor (both Targets as one), order, age on shelf, price as % of retail, price band, person.
   - **Measure:** items, $ price, $ retail.
   - **Chart:** pie, bar, histogram.

   The same panel shows **Counted vs Not counted** side by side, so the report and the shrink analysis use one tool.
6. **Price % of retail.** First a 1% histogram (0 to 100%+). Then fixed buckets picked from that distribution, likely under 20 / 20-29 / 30-39 / 40-49 / 50-69 / 70+. The final edges are set from the real data in Phase 4.
7. **Age on shelf** (from check-in): under 1 week / 1 month / 2 months / 3 months / 6 months / 1 year / older.
8. **Production work.** Reads run directly on production (read-only scripts in `workspace/`). Changes go through Requests, staged and then approved by the owner in chat or in Dash, so each one can be undone.

---

## Phases

### Phase 1 — One inventory effort (fix the midnight split)
The count no longer resets at midnight, and yesterday's two halves become one inventory.
**Gated by:** none. Small; ship first, deployed after close.

Acceptance:
- [x] `ensure_day_count` → `current_effort`: the open `InventoryCount`, or a new one only when none is open. Runs left open over a closed effort are stopped, as today.
- [x] Migration drops the unique rule on `day` and adds `closed_by`. The count screen, sessions list and report read "effort" (one open at a time).
- [x] `expected` follows decision 3 (frozen ids minus sold or scrapped since, plus checked in since) in `day_summary` and `report`.
- [x] Request kind `stocktake.merge_counts` (15 into 14, as in decision 2), with preview counts and undo.
- [x] Staged in production and applied (the owner said yes, 2026-10-06): Request #12.
- [x] **Close inventory** / **Reopen** for managers. A closed effort is read-only.
- [x] Tests:
  - a run past midnight stays in the same effort;
  - merge and undo;
  - a sold-since item is not missing;
  - one open effort at a time.

### Phase 2 — PR Fix-it: one scan, one answer
Every problem item in a PR cart is cleared from the scan alone or with one tap.
**Gated by:** none (runs beside Phase 1).

Acceptance (by what the scan shows):
- [x] **Duplicate SKU** (already sold, or already scanned in this effort, and the item is physically here): scanning it makes a new item from the same product at the same price, prints its tag, and marks the issue fixed. No click.
- [x] **Old tag** (an older SKU of a live item): reprints the current tag. No click.
- [x] **Wrong price:** price field focused with the scan; Enter saves and reprints.
- [x] **Wrong tag** (the tag's product is not this item): search the right product, tap it, and the item moves to it and reprints.
- [x] **Shrink** (empty box, broken, stolen-and-returned parts): **Shrink** button with reason (stolen / broken / scrap); the processor may **Salvage** (new item, condition parts) in the same card.
- [x] **No tag / new item:** search the product.
  - If that product has **uncounted items** in the open effort, one tap claims the oldest: the physical item becomes that item, its tag reprints, and it leaves the shrink list.
  - Otherwise one tap checks in a new item from the product.
- [x] Every fix writes `Issue.fix`, `fixed_by` and `fixed_at`, and links `new_item`. The PR tab shows a running count fixed / left.
- [x] Tests for each path; the claim path removes the item from potential shrink.

### Phase 3 — Potential shrink worklist
Every expected item that was not counted is listed, and the owner gives each one an outcome fast.
**Gated by:** Phase 1.

Acceptance:
- [x] Page **Inventory → Run count → Efforts → (effort) → Shrink**.
  - The list = expected (decision 3) minus counted minus already resolved.
  - Columns: SKU, title, order, vendor, category, price, retail, checked in (age), last seen (last scan in any earlier count).
- [x] Sort on every column; filter by order, vendor, category, age, price band; search by SKU, title or order.
- [x] Select rows, or **all in this filter**, and mark: **Back stock · Owner took · Sold as generic · Shrink (stolen / broken / scrap)**, with an optional note. Undo per mark.
- [x] **Group views:** by order, product, vendor and category. Each shows not counted / expected (% missing), $ price and $ retail, sorted by % missing. A whole order or product can be marked in one action, e.g. "WLMRT-O99-8G11 is all in back stock".
- [x] Totals across the top: open, each outcome, $ at price and retail.
- [x] Speed: 12,000 rows load and filter in about 2 s (server-side paging and sorting).
- [x] Tests:
  - expected rules;
  - mark and undo;
  - bulk mark by filter;
  - group percentages.

### Phase 4 — Inventory report
One page that answers "what do we have" for an effort.
**Gated by:** Phase 1.

Acceptance:
- [x] **Totals:** items counted, $ price, $ retail, price as % of retail, and expected vs counted (coverage %). Plus scans, runs, hours, problems, and fixed so far.
- [x] **By person** (Bill, Carrie, Michael…):
  - runs, hours scanning, items, $ price, $ retail;
  - items per hour;
  - bad runs and problems found.
- [x] **Breakdown panel** (decision 5):
  - pie, bar or histogram;
  - Counted vs Not counted toggle;
  - click a slice to see its items.
- [x] Price % of retail: the 1% histogram, plus the buckets set from it (decision 6). The chosen edges are recorded here.
- [x] Age on shelf buckets (decision 7). Vendor shows both Targets as one, through `TRGET` after Request #11, or grouped by vendor name until then.
- [x] Prints cleanly (print stylesheet); **Export CSV** of the counted items with every breakdown column.
- [x] Tests on a small fixture: totals, the per-person split, bucket edges, the vendor merge.

### Phase 5 — Orders: "If it all sells" (and why Orders numbers look broken)
A view of each order's profit if everything left sells at X% of today's price, filterable by date.
**Gated by:** none. The audit comes first.

Acceptance:
- [x] **Audit first:** a read-only production check of the Orders numbers. Results go in the Record with order numbers. It checks:
  - orders whose items outnumber the manifest;
  - items with no order (2,657 counted ones);
  - orders with no manifest;
  - sold $ against cart lines;
  - cost per item outliers;
  - the flags Phase 1 of intake_updates shows.
  Each finding is fixed or flagged before the view ships.
- [x] **Orders → If it all sells** (a tab on the Orders page, same filters, ordered date From–To). Columns:
  - Order #, Description, Cost, Retail (manifest), Priced (starting), Sold;
  - **Left at X%** = unsold left (today's price) × X;
  - **Est. profit** = Sold + Left at X% − Cost;
  - **Profit % of cost**.
- [x] X: quick **100%** and **50%**, plus **Custom** (any %). A **Total** line on the same definitions (sums, then ratios).
- [x] Uses the Phase 1 financials (`purchase_order_financials`). No new arithmetic for the shared columns.
- [x] Tests: the X math, the total line, the date filter.

### Phase 6 — Inventories: one list, one page per inventory (owner's design, 2026-10-06)
Run count only counts the open inventory; every inventory, current and past, is in one list. Each opens to a page with Summary, Shrinkage, Order estimates and Sessions tabs.
**Gated by:** Phases 3, 4 and 5 (it reuses them).

**The owner's design** (replaces decisions 4 and the old Phase 7 close step):

- **Two stages only:** **In progress**, then **Done**.
  - Done is the manager's **End inventory**. There is no extra finalize step.
  - After Done, the latest inventory still shows its PR Fix-it items and its Shrinkage list, which can be worked and filtered.
- **Not-found items are shrink estimates.**
  - Every one starts as **Shrink (general)**.
  - The owner re-estimates any of them as back stock, owner use, sold as generic, stolen, or broken / scrap.
  - Totals show each estimate.
- **Sessions** = one person scanning one section (a run). An inventory is made of sessions and should cover every section. A session can still be deleted when the person thinks they messed it up.
- **Estimates only (owner's answer A):** marking a not-found item changes nothing on the item. It stays "on the shelf" in the system.
- **No errors on a tag the system has somewhere else** (owner, 2026-10-06; built with Phase 5, see the Record):
  - The register always adds the item, and the count always counts it.
  - A sold tag in hand means two items shared one tag. The tag in hand keeps its number; the old sale moves to a new item number.

Acceptance:
- [x] **Menu → Inventory:** Search · Run count · **Inventories** · ── PR Fix-it.
- [x] **Run count:**
  - Scans only into the open inventory.
  - With none open it says so. A manager presses **Start inventory**; a scan never starts one.
  - Sections setup (Super User) moves here.
- [x] **Inventories** (replaces the Sessions tab and page):
  - One row per inventory, current on top. Each row shows dates, days, stage, items counted, $ at price, coverage, $ not found, shrink estimate, who counted, sessions, and sections covered (of all).
  - Click a row to open it.
- [x] **Inventory page** (`/inventory/inventories/<id>`), with tabs:
  - **Summary:** the Phase 4 report.
  - **Shrinkage:** the Phase 3 list. Unmarked rows read "Shrink (general)", and the marks are estimates.
  - **Order estimates:** per order, the cost, retail, sold, what the inventory **found** (at price, and at X%), estimated profit and % of cost, with a Total line. A toggle **adds the not-found items estimated as back stock** to what is left.
  - **Sessions:** sections × sessions (who, when, how many), with mark bad, view scans and delete session. Sections not covered are listed.
  - Header: stage, **End inventory** / **Reopen**, and "N problems still in carts → PR Fix-it".
- [x] **PR Fix-it:**
  - Opens on the open inventory, or the latest one when none is open; a new inventory takes over by itself.
  - A picker shows past inventories' carts, for a pile found later.
- [x] The old routes (`/inventory/count/days…`, `/inventory/count/<id>/report`, `/shrink`) redirect to the new page.
- [x] Tests:
  - start only by a manager;
  - no scan without an open inventory;
  - list metrics;
  - order estimates from found items, with and without back stock;
  - PR Fix-it's inventory picker.

### Phase 7 — Data quality from the count
The errors the count exposed are listed, explained and fixed.
**Gated by:** none (read-only first).

Acceptance:
- [ ] A findings table in the Record, each with count, examples and the fix:
  - counted with no retail (412);
  - price above retail (5);
  - on the shelf with no order (2,229 uncounted + 2,657 counted);
  - "system says sold, found on the shelf" (268 scans);
  - not-our-tag scans (196);
  - 287 `intake` items with prices;
  - 148 `lost`;
  - duplicate SKUs on the floor.
- [ ] Each fix is a Request (preview, approve, undo), or a rule in `extended/data-quality.md` when it cannot be fixed in bulk.
- [ ] Items with no order get a fill-in owner ("Legacy stock", named in the register), not a guess, per data-quality-first.

### Later — Shrink analysis
Shrink rate by order, vendor, category and age (stolen and broken apart, owner use left out), and a trend across inventories. Detail when Phase 6 is built.

---

## Acceptance

- [ ] Phases 1 to 7 as above
- [ ] Nothing touches POS; every deploy goes out after close unless the owner says otherwise
- [ ] Every production change is a Request with undo
- [ ] Out-of-scope items stay out

---

## Record

**2026-10-06 — Opened.** After the first full count (10-05, past midnight), the owner listed nine asks. Claude grouped them into seven phases and added the decisions above. The production numbers in "Where it stands" were read the same morning (`workspace/count_review_2026-10-06.py`, read-only).

**2026-10-06 — Phases 1 and 2 built.** The owner said yes to all three questions (merge 10-06 into 10-05, the outcome rules, deploy after close). Claude's calls while building:

- **New check-ins are not expected** (a change to decision 3). Expected = frozen at the start, minus what left the shelf uncounted. Stock checked in after the start and put in a section counted earlier would otherwise look missing. Scanned, it still counts.
- **One open inventory** is kept by a Postgres advisory lock, not a database rule, so no migration had to close count 15. The scan screen uses the oldest open inventory (14). Carrie's run left open in 15 stops the next time she opens the scan screen, and the merge stops it in any case.
- **Closing asks first** ("Close this inventory?"). A closed inventory can be reopened only while no other is open.
- **Auto fixes on scan:** sold or double-counted tag → new item, new tag; system says intake / lost / scrapped → back on the shelf (no print); bad tag → reprint; price problem with one written price → set it and reprint. Wrong title, a price with no number and no tag need one answer.
- **Speed fix found on the way:** a duplicate item (Print as new) re-costed every item on its order (about 30 s on a 5,000-item Walmart load). An item's cost depends only on its own retail and its order's totals, so `duplicate_item_for_resale` now skips that order-wide pass. The scan now takes well under a second.

Checked on the dev copy: a sold tag scanned → new tag sent to print with no click; a written price → set and printed; wrong title → its card opened with the cursor in it; no tag "Tineco" → **It's ITM0218099, print** claimed a not-found item. The inventory list reads "Inventory Tue, Oct 6, 2026 · Open", with **Close inventory**. Printing was stubbed in the test tab, because the PC's print server was running. The test inventory, item and user were removed.

**2026-10-06 — Phases 1 and 2 live.** v2.133.0, commit `e1a83b34`, Heroku v403, deployed 11:46 AM at the owner's word ("asap, do not wait till close"). Request #12 (`stocktake.merge_counts`) merged #15 into #14:

- 10 runs, 2,101 scans and 137 problems moved.
- 2 items were counted in both halves; the later scan became "already".
- Carrie's open run was stopped.
- #14 now has 85 runs and 21,117 scans, and is the one open inventory.

**2026-10-06 — Phase 3 built; live 12:13 PM** (v2.134.0, commit `3943eb5b`, Heroku v404).

- **The page:** **Not found** (`/inventory/count/<id>/shrink`). It is the inventory's "Not found" button now; the old report page stays at `/report`.
- **Code:** `services/shrink.py`, model `ShrinkMark` (migration `stocktake.0004`), 6 endpoints under `counts/<id>/shrink…` including a CSV.
- **Categories:** from the product standard (`ProductProfile.category` when it is a real one, else the product's own). Both Targets group as `TRGET`.
- **Speed on the fresh production copy** (inventory #14, 11,852 not found, $121,143 at price): the list takes 0.5 s, and each grouping (order / product / vendor / category) about 0.45 s.
- **Groups sort by the most items not found** (Claude's call; any column sorts). The top three orders:
  - `WLMRT-O99-8G11`: 4,332 of 12,166 (35.6%, $17,155).
  - `WLMRT-OJU-3V74`: 2,367 of 3,853 (61.4%, $16,174).
  - No order (legacy): 2,229 of 4,886.
- **Top product:** one candle product, 670 of 670 not found.
- Checked in the browser on the local copy (read-only: no marks made). The marks were tested in `test_counts.py` (51 pass).

**2026-10-06 — Phase 4 built; live 12:30 PM** (v2.135.0, commit `ea549c4d`, Heroku v405).

- **The page:** **Inventory report** (`/inventory/count/<id>/report`, the inventory's **Report** button). It replaces the old "missing" report page, which Not found now covers.
- **Code:** `services/report.py`; endpoints `summary/`, `breakdown/?by=`, `histogram/`. The item list (`shrink/`) takes `scope=counted` and `person`, so a chart slice opens its counted items too.
- **Price % of retail buckets:** chosen from the real 1% distribution of the 10-05 count. Peaks at 25% (26% of items), 35% (22%) and 50% (11%), the pricing tiers. So the edges are **under 20 / 20–29 / 30–39 / 40–49 / 50–59 / 60+**, plus No retail.
- **Real numbers (production copy, inventory #14):**
  - Counted 19,964 items, $201,510 at price, $544,077 retail; price is 36.5% of retail. Coverage 62.7%.
  - 27.8 hours of scanning in 85 runs.
  - Carrie 9,536 items (796/h), Bill 7,950 (710/h), Michael 2,478 (536/h).
  - Each part loads in about 0.4 to 1.1 s.
- **Claude's calls:**
  - An item counts for whoever's scan found it first.
  - Hours are run time with bad runs left out.
  - A pie shows one side (Counted or Not found) with the top 7 and Other; bars show both.
  - Age is time on the shelf as of today.

**2026-10-06 — Phase 5 built; live 1:36 PM** (v2.138.0, commit `cfe57343`, Heroku v408, with the no-errors rule). The audit ran read-only on the fresh production copy (`workspace/inv_effort/orders_audit.py`, 351 orders).

**Why the Orders numbers looked broken.** The April import marked 83,489 old-system (V1/V2) items `scrapped`, meaning "no recorded sale" (data-quality ITM-06). The Orders page counted them as priced stock:

- old orders showed Priced 7 to 10 times their cost;
- some showed $0 sold (`AMZ17670`: all 926 items are such rows).

**Fix:** `purchase_order_financials` leaves those rows out of Priced, approved retail, retail processed and the item count, counts them (`legacy_unsold`), and flags the order `old_system_unsold`. Total Priced across all orders goes from $5,685,521 to $3,241,521 (−$2.44M of phantom stock). 309 orders carry the flag.

**Other findings, flagged:**

- `items_over_manifest`: 6 orders have more items than their manifest's quantity (over 10%). Example: `WLMRT-O99-8G11`, 15,017 items against 13,317 (extras and print-as-new copies). There were 18 before the old rows were left out.
- `no_cost`: 42 placeholder orders (GEN…, MISFIT); profit % shows `-`.
- `status_behind`: `TGT127616` still says paid with 488 items checked in. The owner can set it to delivered; not changed here.

**Noted only:**

- 397 sold items have neither a cart line nor `sold_for`, so Sold is a little low.
- 2 orders say delivered or complete with no items (`AMZ24714`, `TRGET-OPK-TCUL`, which is not processed yet).

**The view:** **Orders → If it all sells** (`?view=profit&x=`), with the Orders page's filters, including the date range by ordered date.

- Columns: Order and description, Cost, Retail, Priced, Sold, Left now, Left at X%, Est. profit, % of cost.
- Quick 100% and 50%, plus a custom %.
- A Total line on the same definitions (the summary's sums, then the ratios).
- Checked on the copy, 307 orders including older ones: cost $1,754,867, sold $2,014,511, left $244,061. Est. profit $503,706 (29%) at 100%, $381,675 (22%) at 50%.

**2026-10-06 — The owner reshaped the pages** after the report, Not found and If it all sells were each hard to find. The new Phase 6 is in his words:

- Inventories list, and an inventory page with Summary, Shrinkage, Order estimates and Sessions tabs.
- Run count counts only the open inventory and never starts one by a scan.
- Two stages (in progress, done) with no finalize step.
- Not-found items are shrink estimates, starting as Shrink (general).
- PR Fix-it follows the newest inventory and can pick a past one.
- Order estimates use what the count found, with a toggle to add estimated back stock.

The old Phase 7 close step is dropped. Data quality is now Phase 7.

**2026-10-06 — Phase 6 built; shipped in v2.140.0.**

- **Start and stages:**
  - A manager presses **Start inventory** on Run count or on Inventories (`POST counts/start/`, `counting.start_inventory`). A scan never starts one: `start_run` raises `NoInventory`, and the API answers 409 `NO_INVENTORY`.
  - The stages are In progress and Done (`stage` on every summary). `latest` marks the newest one.
- **Inventories list:**
  - `GET inventories/` (`services/inventories.py`). Each row shows counted, $ at price, price % of retail, not found, coverage, sections done of all, sessions, hours, who counted, open PR Fix-it problems, and how many not-found items have an estimate.
  - A done inventory keeps its numbers in `InventoryCount.summary_cache` (migration `stocktake.0006`), set at End and cleared by Reopen or a merge. The open problems and the estimates stay live.
- **Inventory page** `/inventory/inventories/<id>?tab=`:
  - **Summary** = the Phase 4 report.
  - **Shrinkage** = the Phase 3 list. Unmarked items read "Shrink (general)"; marks are estimates.
  - **Order estimates** (`GET counts/<id>/orders/`):
    - Per order: cost, sold so far, the found items still unsold (n and $ at price), and back-stock estimates.
    - The page applies 100% / 50% / custom and the back-stock switch, with a Total line.
    - Found items that sold since are already in "sold", so they are not counted twice.
  - **Sessions** = the old Sessions page for one inventory, plus a "Not done yet" list of sections.
  - **Header:** stage, PR Fix-it (N in carts), Run count, and End inventory (with a warning when sections are not done) or Reopen.
- **Run count:** with none in progress it says so. A manager sees **Start inventory**; others see "A manager starts it". The Super User edits sections from **Edit sections**. The manager tabs are Count | Inventories.
- **PR Fix-it:**
  - `issues/?count=<id>|all`; the default is the latest inventory.
  - `fixit/inventories/` feeds the picker: the latest, plus earlier ones with open problems.
  - A scan still finds a tag's problem in an earlier inventory.
- **Redirects:** `/inventory/count/days` → Inventories; `/days/<id>` → Sessions tab; `/count/<id>/report` → Summary; `/count/<id>/shrink` → Shrinkage.
- **Files:**
  - `CountDaysPage.tsx` became `InventorySessions.tsx`.
  - New: `InventoriesPage.tsx`, `InventoryPage.tsx`, `OrderEstimatesTab.tsx`, `inventoryNames.ts`.
  - `ShrinkPage` and `InventoryReportPage` now take a `countId` prop.
- **Tests:**
  - `test_counts.py`: 60 pass (new `InventoriesTests`; scans go through a manager-started inventory).
  - Nav and count vitest: 64 pass. tsc is clean.
- **Checked locally on the prod copy:**
  - The list loads.
  - Order estimates: 35 orders, cost $153,287, sold $279,679, found and unsold $166,451 (17,281 items), est. profit $292,844 at 100%. 2,652 found items have no order.

**2026-10-06 — "No errors" built; live with Phase 5** (v2.138.0).

- **The rule (owner):** a tag the system calls sold, intake, lost or scrapped never stops the register or the count.
- **Two items, one tag:** `services/duplicate_tag.py` (`move_sale_to_new_item`). The tag in hand keeps its number and goes on the shelf. A new item (`SALE_MOVED_FROM:<sku>`, `parent_item` = the tag) takes the old sale: completed cart lines and delivery jobs move to it. The money does not change.
- **Not automatic:** consignment and online-listed items (`why_not`). The register still stops for those, and the count sends them to the PR cart.
- **Register:** `add_item` moves the old sale and rings the item up. Scan log outcome `pos_sold_tag_moved` (migration `inventory.0109`, choices only).
- **Count:**
  - A sold tag is counted (`ok`), gives the warning sound, and asks: **It's here: keep this tag** (`kept`, done on the spot; migration `stocktake.0005`), **Not sure: PR cart**, or **Leave it**.
  - Intake, lost, scrapped and the like go back on the shelf and count, with no problem to answer.
- **PR Fix-it:** a sold tag scanned there is fixed the same way, with nothing to print (`move_sale`). **Print as new** stays for the consignment and online cases.
- **Tests:**
  - `test_counts.py`: 57 pass.
  - Register: `test_cart_add_item_audit` / `test_cart_add_resale_copy`, 8 pass. The other POS tests are unchanged; 5 dashboard tests are date-sensitive and fail on the live release too.

---

## See also

- Index: [`_index.md`](./_index.md)
- Count app design: [`inventory_count.md`](./inventory_count.md)
- Orders numbers: [`intake_updates.md`](./intake_updates.md), [`extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- Data rules: [`extended/data-quality.md`](../extended/data-quality.md)

<!-- Last updated: 2026-10-06 (one inventory across days and PR Fix-it one-scan fixes: see inventory_effort) -->
# Initiative: inventory_count

**Status:** Active. v1 shipped 2026-10-01 (v2.112.0, v2.113.0). **v2 shipped 2026-10-01 13:32 in v2.114.0** (commit `53462bb2`, Heroku v377, backup `b013`; branch `count-v2`, worktree `C:\Coding\_worktrees\ecothrift-dashboard--ship-2112`). **Needed by Mon 2026-10-05** for the first shelf count. The owner plans to count every Monday.

## Version 3 (inventory_effort Phases 1 and 2, 2026-10-06)

Wins over Version 2 where they differ. Detail: [`inventory_effort.md`](./inventory_effort.md).

- **One inventory across days**, not one count per day: `InventoryCount` stays open until a manager presses **Close inventory**; only one is open at a time (an advisory lock in `counting.ensure_current_count`). The first full count (10-05) had split at midnight.
- **Expected** = on the shelf when it started, minus items that left the shelf (sold, scrapped, lost) without being counted (`counting.expected_ids`). Closing keeps that set (`closed_expected_ids`).
- **PR Fix-it, one scan:** `POST /api/stocktake/fixit/scan/` fixes what is certain and the tag prints with no click (`fixit.auto_fix`); the rest opens its card. No tag: find the product, then **It's ITM…** claims an item the inventory has not found, or **New**. Wrong title: pick the right product. **Shrink** (stolen / broken / scrap, optional salvage).


Sections "What it does", "Decisions" and the trial sheet below describe v1; where they differ, this section wins.

- **Sections** (`stocktake.Section`): the Super User adds them (start screen, or Count sessions). A stand-in until real location codes exist.
- **One count per day** (`InventoryCount.day`). The day's first run creates it and freezes what the system says is on the shelf. v1 counts have no day; migration `0002` closes them; they list as "trial".
- **Run** = one person, one section, start to stop, with a note. One open run per person. **Stop** asks: section complete / not finished / bad run. A bad run is kept but left out of totals and of the "already scanned" check; a manager can count it again. Start over is gone; nothing is deleted.
- **Scan results:** found; already scanned (says where, who, when); system says sold; not on the shelf in the system; tag not recognized (`ITM` + digits, no item); not one of our tags (anything else).
- **Problems** (`stocktake.Issue`): opened by a scan, by **Problem?** on a scan (wrong title, bad tag, price too high / low, wrong section), or by **No tag**. Each has 1 to 3 big answers (`frontend/.../count/countProblems.ts`): skip (my mistake), **PR cart**, leave it and note it, **relocate cart** + the section it belongs in. Unanswered problems never block scanning; "section complete" needs them answered.
- **Carts** (`stocktake.Cart`): "Pat PR Cart 1", "Pat Relocate Cart 1"; numbers restart each day; "My cart is full" starts the next.
- **Undo:** any scan can be removed and put back (soft, `removed_at`).
- **Scan box:** one line. A scanner types anywhere. A tap on the box brings up the phone keyboard; a code + Enter counts it; words list matching items, one tap counts one. Leftover words can't swallow a scan (the `ITM` code is picked out; words clear after 20 s).
- **Count sessions** (`/inventory/count/days`, managers): days → sections → runs (who, start, stop, time, scans, per minute, problems, status, note); mark bad / complete, view and remove scans, close / reopen the day, link to the shrink report.
- **PR Fix-it** (`/inventory/pr-fixit`, staff, Retail Floor menu): open cart items with the quickest fix. Sold → **Print as new** (`duplicate_item_for_resale`). Bad tag → **Reprint**. Title / price → edit, **Save, print tag** (a shared product is not renamed: the item gets its own). No tag / unknown tag → find the item and print (counts it), or **Add, print** (new `misc` item, note `INVENTORY_COUNT_QUICK_ADD`). Not on shelf in system → **Put on shelf, print**. Relocate → **Moved**. Tags print through the local print server on that computer.
- **Code:** `apps/stocktake/services/counting.py`, `fixit.py`, `views.py`; tests `apps/stocktake/tests/test_counts.py` (21). Front end `CountPage`, `ProblemSheet`, `CountDaysPage`, `PrFixitPage`, `countQueue`, `countProblems`.
- **v2.115.0 (shipped 2026-10-01, commit `8ff5a021`, Heroku v378, backup `b014`):** Count sessions as cards on a phone; Done / In progress / Not started counters (`SectionProgress.tsx`); each section's count from the last earlier day it was completed is its expected number (`counting.section_progress`); the Super User can delete a session or a whole day (`DELETE runs/<id>/`, `counts/<id>/`). No migration.
- **Open after v2:** real trial Mon 10-05; per-section expected counts need item locations (not there yet), so "missing" is still whole-store; a day's summary reads all good scans each batch (fine at a few thousand, watch at 30,000).
**Owner's ask (2026-09-30):** a simple, mobile-first app. Scan an item number like the POS does; each scan goes into a queue and is looked up in the background, so nobody waits. It beeps on success. On failure it backs up: it shows the code that failed and how many rows ago it was. The counts give a true look at shrink and at what is on the shelves.

## What it does

- **Start a count** (`/inventory/count`). The count freezes the list of items the system says are `on_shelf` right now. Sales and new stock during the count can't look like shrink.
- **Scan with a Bluetooth or USB scanner** (owner, 2026-09-30: no camera). The scanner works like a keyboard: it types the code and presses Enter. The scan box keeps focus, keeps the phone's on-screen keyboard from popping up (a "Type" button brings it back), and catches scans even after a tap elsewhere on the page. A second read of the same tag within 0.4 s is ignored as a double-read; a deliberate rescan is answered "already scanned".
- **The queue.** A scan is recorded the instant it is read. Batches are sent every 300 ms. If the connection drops, scans stay on the phone (saved in the browser) and are re-sent. Each scan carries its own id, so a retry never counts twice.
- **Sounds:** one short high beep = found on the shelf. Two quick beeps = already scanned, or found but the system says it isn't on the shelf (sold, scrapped, ...). A long low buzz (and a phone vibration) = no item has that code.
- **Back up.** A big banner shows the code and "N scans ago". Every problem stays in a **Problems** list with its rows ago.
- **Finish.** Waits for every scan to be answered, then closes the count. Nothing more can be scanned into it.
- **Report** (`/inventory/count/<id>/report`, Managers and up): expected, counted, not found (count, % and dollars at price, retail and rough cost), items found that the system says aren't on the shelf, codes with no item, and a CSV of the missing items. Items sold while the count ran are listed separately and are not shrink.

## Where

- Backend: new app `apps/stocktake` (own migration `0001`, depends on `inventory.0100`; it does not touch ProductProfile, ProductProposal or the pending `inventory` migrations). API under `/api/stocktake/`. Tests: `apps/stocktake/tests/test_counts.py` (7).
- Front end: `frontend/src/pages/inventory/count/` (`CountPage`, `CountReportPage`, `countQueue`, `countSound`), `frontend/src/api/stocktake.api.ts`. Nav: Retail floor → **Inventory count**.
- Built in the worktree `C:\Coding\_worktrees\ecothrift-dashboard--inventory-count` (branch `inventory-count`, from `origin/main` v2.111.0), **uncommitted**, so the running standardize job and the main tree's unshipped files are untouched.

## Decisions I made (easy to change)

- Expected = every item with status `on_shelf` at the start. No aisle or zone scoping yet: one count covers the whole floor.
- "Found" only needs the SKU (`ITM…`). Location is shown when the item has one; it is not checked.
- Scanning the same item twice is a warning, not an error.
- Employees can scan; only Managers and up see the report.

## Ship

Not shipped. To ship: merge `origin/main` into the branch, bump **v2.112.0** (MINOR: new app and migration), run the pre-ship gate (`lean_test.py suite ship`) on that tree, then `ship.md` from the worktree. Production migration creates two new tables only.

## Open

- [ ] A real trial with the owner's scanner and phone: the scanner's suffix (Enter or Tab, both work), the phone keyboard staying hidden, sound on iPhone (starts after the first tap or scan), a dropped connection mid-count. Scanner must be in keyboard (HID) mode, not SPP.
- [ ] Owner's first count (Mon 10-05), then tune what he hits.
- [ ] Later, if wanted: count one aisle at a time, a "where is it" for missing items, weekly trend of shrink.

## Thursday trial sheet (owner, about 15 minutes, after v2.112.0 is live)

You need: your phone, the scanner, 15 to 20 items from the floor, one item you know was sold, and a pen.

1. **Pair the scanner** with the phone in keyboard mode (it types the code and presses Enter). Open Dash on the phone, Retail floor, **Inventory count**. Tap **Start a new count**. Name is automatic; that is fine.
2. **Scan 10 items.** For each one you should hear one short beep and see a green row with the item's name. Note: does it read the tag every time? How many scans a minute feels natural?
3. **Scan one item twice.** Wait a second between. Expect two quick beeps and an orange "Already scanned" banner.
4. **Scan the sold item** (or any tag you know is not on the shelf). Expect two beeps and an orange banner "system says sold".
5. **Scan a code that does not exist**, for example type `ITM0000000`. Expect a long low buzz, a red banner "Back up: not found" with the code and "just now", and the phone vibrating. Scan two more items, then look: does it say "2 scans ago"?
6. **Tap somewhere else on the screen, then scan.** It should still register (the scan box keeps itself ready).
7. **Bad connection:** turn on airplane mode, scan 3 items (rows wait with "Looking up"), turn it off. Within a few seconds they should turn green. The header shows "Offline: saved, will send" while offline.
8. **Reload the page mid-count.** The count and your scans should still be there.
9. **Finish count**, then open **See the report** (managers only). Check: expected vs counted, the not-found list, a CSV download.
10. **Write down** anything slow, confusing, or wrong: what you did, what you expected, what happened. Send it to Claude; fixes are built Fri to Sun and may ship Sat or Sun.

Good signs: no missed scans, sounds are clear across the room, and you never wait for a lookup.
If the scanner adds a Tab instead of Enter, that works too. If it reads only barcodes and not the QR on the tag, tell me: that is a scanner setting or model issue.

## Record

**2026-10-01 — v2.113.0:** a timer in the header (time since start, scans, scans per minute; server clock), **Start over** for managers (`POST counts/<id>/restart/` discards the open count and starts a new one), and an Earlier runs list kept on the phone (last 8). Asked for by the owner mid-count to time scanning strategies.

**2026-09-30 — Built.** Verified in the browser on a phone-sized screen: start, typed scans (found, repeat, unknown, sold), the banner with rows ago, finish, report. Retested after the change to scanner-only input: scan with no tap, scan after tapping elsewhere, repeat, unknown. Server tests 7, front end 54 (queue logic, nav), `tsc` clean.

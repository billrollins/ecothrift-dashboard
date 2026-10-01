<!-- Last updated: 2026-09-30 (built and verified on a phone-sized screen; not shipped) -->
# Initiative: inventory_count

**Status:** Active. Built 2026-09-30, waiting for the owner's ship order. **Needed by Mon 2026-10-05** for the first shelf count. The owner plans to count every Monday.
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

Not shipped. To ship: merge `origin/main` into the branch, bump **v2.112.0** (MINOR: new app and migration), run the pre-ship gate (`lean_test.py suite ship`) on that tree, then `ship-git.md` from the worktree. Production migration creates two new tables only.

## Open

- [ ] A real trial with the owner's scanner and phone: the scanner's suffix (Enter or Tab, both work), the phone keyboard staying hidden, sound on iPhone (starts after the first tap or scan), a dropped connection mid-count. Scanner must be in keyboard (HID) mode, not SPP.
- [ ] Owner's first count (Mon 10-05), then tune what he hits.
- [ ] Later, if wanted: count one aisle at a time, a "where is it" for missing items, weekly trend of shrink.

## Record

**2026-09-30 — Built.** Verified in the browser on a phone-sized screen: start, typed scans (found, repeat, unknown, sold), the banner with rows ago, finish, report. Retested after the change to scanner-only input: scan with no tap, scan after tapping elsewhere, repeat, unknown. Server tests 7, front end 54 (queue logic, nav), `tsc` clean.

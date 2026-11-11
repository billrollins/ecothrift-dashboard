<!-- Last updated: 2026-11-10 -->
# Processing Enhancements: decisions

Project opened by Bill on 2026-11-10 after training a new processor (another starts 2026-11-11). Four Dash Updates, one sub each. This file is the one place for what was decided; the work itself is the rows in Dash Updates (project "Processing Enhancements"). Subs read it from the **main checkout** (the first folder `git worktree list` prints), because Mainline keeps it current there.

**(guessed)** = Mainline decided it the way Bill would, while he was away. He can overturn any of them; the row then changes and the sub is told.

## Bill's words (2026-11-10), kept short

1. **Top of Processing.** "The top header needs to be more rich, more valuable, more clean/organized." Most important: what we paid, and the Target Price total (typically 2x the cost; a superuser can adjust). Next: what we are on track to do (prices set on items, plus estimated prices for unprocessed items), "this tells us if we have room to move prices up or down." Then: total items and items left, added items so far, disputed items so far with their retail $ against the 5% of retail threshold B-Stock needs to accept a dispute, and what the dispute is worth so far (shipping not included). Date delivered and the day the dispute is due. Any other issues to note. And a **Truck Plan**: filled in before processing starts, a universal modal also seen from an Order. "We want Order number to open the order universal [window], but we want the description to open the Truck plan... I think. Truck plan needs to be determined."
2. **Photos.** Getting a phone photo onto the desktop "takes forever." He wants a per-user photo drop box: sign in on the phone, tap Photo drops, tap Take photo, optional very simple touch-up (crop, rotate). On any Upload photo: (1) take photo, (2) from files, (3) from my photo drawer. "A universal surface I do not want to remake 18 times. ALL upload photos the same, with these 3 methods." Order on a phone: Take photo, Photo drawer, File. On a desktop: Photo drawer, File, Take photo.
3. **Customer returns.** A Returns page in the Processing workspace with "ALL the simple steps a processor needs to take with returns. Send to restoration, price again etc."
4. **Floor issues.** "Yet another way an item can show up in processing. Item has an issue on the retail floor, comes to processing and we need SIMPLE methods to get it done."

He will test-drive each one on its own local server when he is back.

## Decisions

### All four
- **D1 (guessed).** Dash Update #81 (his 11-09 note "better numbers at the top, Total Truck Cost, Target Price") is update 1 of this project, not a second row.
- **D2 (guessed).** Nothing is hidden from staff. Money numbers on the Processing header show to everyone who can open Processing today, as the current header does; only *changing* the Target Price is for a superuser.
- **D3.** Words on screens are plain and short (house rule). No new workspace; everything lives in Processing (and the shared photo control lives wherever a photo is asked for).

### 1. Processing header
- **D4 (guessed).** "Paid" = the order's total cost (price + fees + shipping), with the three parts in the hover.
- **D5 (guessed).** Target Price total = 2 x Paid by default. A superuser can type another total on that order; it is saved on the order with who and when.
- **D6 (guessed).** "On track" = tag prices of the items checked in so far + an estimated price for every manifest line not yet processed (the line's own proposed price when it has one; otherwise its retail x this truck's price-to-retail rate so far). Shown beside the target as a plain "$X over" / "$X under" so the processor knows whether to price up or down.
- **D7 (guessed).** Dispute worth so far = (disputed retail - 5% of the truck's retail) / the truck's retail x (price + fees). Never below $0. Shipping is not in it. His example: 50 missing on a 100 truck = (50 - 5) / 100 x (price + fees). The header shows disputed items, disputed retail, the 5% line, and the worth; the hover shows the sum.
- **D8 (guessed).** Truck Plan v1 is one window, opened from the load description in the Processing header and from the Order window. It holds: the target total (D5), the pricing start point for this truck (percent of retail), what to watch for (free text), who is on it, the dispute due date, and known issues. Before it is filled in, Processing shows a line "No truck plan yet" with a button; it does **not** block processing (a new hire starts 11-11). What else belongs in the plan is Bill's to say: the sub asks him in the row.
- **D9 (guessed).** The Order number in the header opens the Order window (it exists already); the description opens the Truck Plan.

### 2. Photos
- **D10 (guessed).** One shared control, "Add photo", with three ways: Take photo, Photo drawer, From files. Order by device as Bill said. It replaces every staff-side photo upload in Dash. Customer-facing screens (the Thrift+ app's selfie and ID steps) are not staff uploads and stay as they are.
- **D11 (guessed).** The photo drawer is per user. A photo stays in the drawer after it is used (marked "used") until the user deletes it; drawer photos older than 30 days are removed automatically. The desktop drawer refreshes by itself so a photo taken on the phone appears within a few seconds.
- **D12 (guessed).** Touch-up is crop and rotate only.
- **D13 (guessed).** "Photo drops" is on Home for every staff member (phone first), not inside one workspace.

### 3 and 4. Returns and Floor issues
- **D14 (guessed).** A customer return and a floor issue are the same thing to a processor: one item that came back and needs one decision. They share **one list and one set of actions**, shown as two pages in Processing: **Returns** and **Floor issues**.
- **D15 (guessed).** The actions, one tap each, each recorded with who and when: **Price again** (new price, prints a tag, back on the shelf), **Back to shelf as is**, **Send to Restoration** (the existing send flow), **Scrap** (with a reason). When one is done, the item leaves the list.
- **D16 (guessed).** Update 3 (Returns) builds the shared list and actions first and commits them early on its branch. Update 4 (Floor issues) builds the floor side (how someone on the floor reports an item: scan it, pick what is wrong, optional note and photo) and then plugs into update 3's shared list. The existing bad-tag report (`stocktake.BadTag`) is looked at first: reuse it or fold it in, do not build a second one beside it.

- **D20 (Mainline, 11-10 evening; replaces what #84 first planned).** A floor report does **not** change the item's status. The open "back in Processing" row is the marker that the item is in Processing's hands. Reason: the pallet and truck accounting (`truck_pallets._NOT_RECEIVED_STATUSES`) treats an item with status `processing` as never received, so a floor report would turn into a false missing item and a false dispute on a finished truck (found by #81).

### Bill, 11-10 evening
- "All processors are done for the day. Why don't you **ship and deploy ALL processing updates as they get done**." So each update ships and deploys when it is built, tested and merged; his test drive happens on the live site. Mainline bundles what is ready at the same time into one release.
- "Give me **3 processing updates of your own**. Add to dash list, create subs, build, ship, deploy. Then send me a message."

### Mainline's three (rows #87, #88, #89)
- **D17 (guessed). #87 Processing Command Center.** Read-only. Per processor, today and this week: items checked in, tag dollars, both per clocked hour, average tag, big items ($25 and up), tag errors traced to them; the room against the day's share of the weekly processing goal; a new hire beside the room average. It follows Retail's Command Center for who can open it (leads and the owner); every processor sees their own line. No pay data. Hours come from the time clock; when a person has no clock entry the per-hour cell is blank, never guessed.
- **D18 (guessed). #88 Close the truck.** Finish the pieces that exist (`truck_finalize.py`, `Dispute`, `BStockDispute` and its public page, `DisputeItemsDialog`, Close PO); do not build a second dispute system. One guided step: missing, broken, added; the claim by D7 (one rule, the same number as the header); a claim list to copy into B-Stock; filed on / amount back; Finalize. Dash never files anything on B-Stock itself. A count-down on trucks with an unfiled claim worth filing. Finalizing never deletes or changes items.
- **D19 (guessed). #89 Price coach.** Facts from our own sales at the price box: what items like this sold for, how many days they took, what is still unsold at what price. Order of evidence: the same product, then similar products, then category and brand. It never sets or blocks a price, never slows check-in (fails silent), and says how many items the line rests on; under 5 items it says "not enough like this yet".

## Local test servers (one pair per sub, so Bill can test each alone)

| Update | Backend | Front end |
|---|---|---|
| 1 Header | 8011 | 5181 |
| 2 Photos | 8012 | 5182 |
| 3 Returns | 8013 | 5183 |
| 4 Floor issues | 8014 | 5184 |

All four use the local copy of production (`local_shared`), so Bill signs in as himself.

## Migrations (so four subs do not collide)

Each sub keeps its migration names exactly as below and depends on the latest migration on `origin/main` for that app. Mainline fixes the order when it merges.

| Update | App | File name |
|---|---|---|
| 1 Header | inventory | `0125_truck_plan.py` |
| 2 Photos | core | `0017_photo_drop.py` |
| 3 Returns | inventory | `0126_processing_reentry.py` |
| 4 Floor issues | inventory | `0127_floor_issue.py` (only if it needs one) |

## Open questions for Bill (also in each row)

- Truck Plan: what else belongs in it?
- Photos: is 30 days right for clearing the drawer?
- Returns and Floor issues: are the four actions (D15) the full list?

## Shipped (2026-11-10, evening)

| Release | Heroku | Updates |
|---|---|---|
| v2.270.0 | v619 | #81 header and Truck Plan, #82 photo drawer and Add photo, #83 Returns, #84 Floor issues, #86 menu starts in your department |
| v2.271.0 | v620 | #87 Processing Command Center, #88 Close the truck, #89 Price coach, #85 faster ship and deploy |

Nothing was test-driven by Bill first (his order). Each update was tested by its sub, then the merged release was type-checked, tested on a fresh test database and tried in the browser on this PC before the deploy.

## Waiting for Bill (questions the subs raised)

1. **Truck Plan (#81):** what else belongs in it?
2. **Photo drawer (#82):** is 30 days right? Staff-taken photos of Thrift+ members' faces were left out of the drawer on purpose (a customer's face would sit in a staff member's personal drawer): keep it that way?
3. **Returns (#83):** the four steps: is that the full list? Returns nobody marked handled since launch show as waiting the first time the page opens: keep them, or start empty?
4. **Floor issues (#84):** is the list of ten problems right?
5. **Close the truck (#88):** the Truck page still shows its own "expected refund" (95% of the price, all missing counted); the header and the Close step use Bill's 11-10 rule. One rule for both?
6. **Price coach (#89):** the coach and the older recovery line can disagree on one screen (one said "Priced low" where the coach said that price has mostly sat). One voice later?
7. **Command Center (#87):** nearly all check-ins are under one sign-in (93% in four weeks), while two processors clock full days with none under their own. Per-person numbers only mean something when each processor checks in as themselves.

## Found on the way (not built)

- `frontend/src/pages/inventory/processing/ProcessingSendToRestorationDialog.tsx` is rendered nowhere; `RestorationsToSetupPanel.tsx` still imports one helper from it. Clean-up candidate.
- The old `Dispute` rows (162 "open" in production) are untouched; Close the truck uses `BStockDispute` only.
- `lean_test.py paths` reports `printserver/build.py:110` (a drive-letter path) from worktrees.
- First Heroku build with the cached front-end packages took 182 s (142-157 s before). The next deploy is the real comparison; drop `cacheDirectories` if it is not faster.
- Test databases left by worktrees (`test_local_shared_<folder>*`, `test_sub81`, `test_lane83`, `test_mainline*`) are never dropped.


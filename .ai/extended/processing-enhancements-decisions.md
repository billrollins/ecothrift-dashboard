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


## 11-11: Bill's next asks (rows #95 to #99) and Mainline's decisions

Bill, 2026-11-11, before leaving for the day. Subs now run Opus 5.5 at high effort. All (guessed) items are Mainline's; he answers from his phone.

### #95 Photo sheets ("a BIG need")
His words: "I want a Template for Printing Photos. Need multiple templates Processors can choose from: 1 photo, 1 big 3 small etc. The templates are for standard 11.5 x 8 or whatever the size is. Consider multiple templates, multiple numbers of photos and portrait OR landscape. Photos are chosen like all photos (Take, file or drawer). We need a STANDARD Title etc, so like a tag but for a photo and title. This is for items that are in brown boxes and customers have NO IDEA what they look like, so I need it to be GREAT as far as information for the user. I would probably do the full title across the top. As far as standard price tag type things like item number: I think we could do some of that but maybe have it be a check box. Reason being: maybe sometimes we are not selling in store, or we anticipate price changes and do not want to reprint, OR since there is a tag we in general do not want to be redundant." It "needs to go through a few critic rounds"; Mainline is the critic and the sub sends it the image of each sheet.

- **D21 (guessed). What it is for.** A customer standing six feet from a closed box should know in three seconds what is inside, what it looks like, how big it is, what comes in the box and what shape it is in. The photo does most of that work, so photos get most of the sheet.
- **D22 (guessed). Paper and printing.** US Letter, 8.5 x 11 inches, upright or sideways, with a margin every office printer can print (about 0.4 inch). It prints from the browser's own print window (which can also save a PDF). Only the sheet prints: no menus, no buttons. White paper, black words, no heavy ink fills.
- **D23 (guessed). The standard title block.** The full title across the top, big and bold, never cut off: it shrinks to fit two lines, three at most. The brand sits small above it when there is one. Under the photos, up to four short facts with plain labels (Size, In the box, Condition, Good to know); a fact left empty does not print, label included. "Clean up with AI" may draft the facts from what Dash knows about the product; a person can always change them.
- **D24 (guessed). Templates.** At least: one photo; two photos; one big and two small; one big and three small; four in a grid; each upright and sideways. Dash picks a sensible one from how many photos there are and the shape of the first, and the processor can switch by tapping a small picture of each layout. Each photo can "Fit" (the whole photo shows) or "Fill" (cropped to the space); the main photo starts on Fit so the item is never cut. Photos can be swapped and turned.
- **D25. Tick boxes, off unless wanted** (his reasons: not always sold in the store, prices change, the tag already says it): Price; Item number with its barcode (only when the sheet is for one tagged item). Nothing else of the price tag goes on the sheet.
- **D26 (guessed). Where and how.** A "Photo sheet" button where a processor already is (the row and check-in screens, the item window, the product window) and a "Photo sheets" page in the Processing menu that also works with no item at all (type the title), for things not sold in the store. Photos come through the shared Add photo (take, photo drawer, files). A sheet is saved with its item or product so "Print again" is one tap and the next one of the same product starts with its photos.

- **D26b (Bill, 2026-11-11, later the same day).** "These photos will actually be more likely to be stock photos we grab from the web (likely white background or staged backgrounds)... We are not removing from the box (in many cases they will be unassembled). We are searching for the item online and copy/pasting the photos." So: pasting is the main way in (Ctrl+V, a picture dragged in, a pasted picture link), with a "Find pictures" button that opens an image search for the title; Take photo, Photo drawer and From files stay. Layouts are judged with web pictures (white and staged backgrounds, mixed shapes). Because the picture shows the product assembled and new while the item is boxed and often unassembled, the sheet says what the picture is (a caption, default "Product picture") and "needs assembly" and the condition sit where they cannot be missed (guessed, until Bill answers).

### #96 Add item with AI
- **D27 (guessed).** One big "anything you know" box, the shared Add photo, and whatever boxes the person already filled. One button, "Clean up with AI", fills the rest. What a person typed in a box always wins over the AI. The AI's fills are marked so they can be checked, as on Processing's Edit product details. Nothing is required before the button except something to go on (some words or a photo).

### #97 Processing: scan flow
- **D28 (guessed).** The search box is on screen on the queue, the row page and the check-in screen. Back to queue: the cursor is in the queue search and the old words are selected, so a scan replaces them (nothing to click or delete). After a check-in: the page stays where it is, the cursor goes to the search with its words selected. A scan anywhere on these screens that is not in a typing box goes to the search.

### #98 Processing: product search inside a row
- **D29 (guessed).** Opening a row shows likely products at once, fetched ahead (the row's own words and identifiers first, then products close in meaning). A clear "Search products" button and box. The search looks at meaning, tags, identifiers and titles together and ranks them; a missing or extra word does not empty the list. It must feel instant: a result list in well under half a second on the real data, measured before and after.

### #99 Truck Plan default
- **D30 (guessed).** Every truck has a plan from the first time it is opened, filled from one store default that a superuser edits in Settings. It shows "Default plan" until someone changes it; saving a change makes it that truck's own. The "No truck plan yet" state goes away. Default text until Bill gives his own: pricing starts at 55% of retail (his habit); target 2 x what we paid; watch for missing and broken items and mark them the day they are found; dispute due 4 business days after delivery.

### Disputes by manifest row (Bill said yes 11-11: rows #100 shipped v2.278.0, #101, #102)
His words: "Dispute is unit/manifest ROW based. NOT Product or Item. So when disputing an item from a truck we are disputing the manifest row (we can of course then create a product or item from it, BUT we do not have to). This is for rows that do not come. It does not make sense to create a product and check in just to dispute that it did not come. ALSO this should be something that we see (and maybe even a quick action) from the queue page rather than the row detail/check-in page." And: "when disputing an item we need to take photos if it is anything other than missing."
Proposed rows: (a) dispute a manifest row from the queue, by units, with no product or check-in; (b) photos required for every reason except "did not come", carried into the dispute list for B-Stock; (c) one dispute record: the header, Close the truck and the B-Stock list all read row disputes, and the old item-based marks and the 162 old "open" rows are folded in or closed.
- **D31 (guessed, #101).** Photos come in the Dispute window, with the dispute, through the shared Add photo; at least one for every reason but "did not come", up to 6 (B-Stock asks 1-4 per pallet). No adding photos to a dispute later: undo and dispute again. Item disputes from the check-in screen are left for #102 (one record).

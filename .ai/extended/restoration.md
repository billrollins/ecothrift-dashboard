<!-- Last updated: 2026-10-28 (restoration tag follows the label-size setting) -->
# Restoration / TARS

Staff restoration: Ashley prices grades, Mike runs the bench, Bill sees what it earned. Initiative: [`finalize_tars_app`](../initiatives/_archived/finalize_tars_app.md). Shipped **v2.71.0** (GitHub; not Heroku).

House rule: **nothing may shift the page** when state changes. Standing conditions collect behind a header badge (`StudioNotices.tsx`) and open in a drawer. See [`.ai/extended/frontend.md`](frontend.md).

---

## Routes

| Path | What it is |
|------|------------|
| **`/restoration/overview`** | TARS home: scoreboard strip + queue (also Ashley's desk). `/restoration/queue` redirects here. |
| **`/restoration/bench`** | Command deck (item, notes, grade & value, dispatch) + grades + purchase summaries + current action and one history. |
| **`/restoration/parts-requests`** | Superuser command center: live pipeline board + history by item. Sidebar badge counts approvals, cancel asks, and reviews. |
| **`/restoration/tracking`** | Restoration list (E3): what is in restoration now, oldest first, or finished in the last 30 days. |
| **`/restoration/tars`** | Old Studio bookmarks → in-dashboard bench, else overview. |
| **`/inventory/restorations`** | Processing TO/FROM hub (grade setup + returns desk). |

No role gate on overview or bench.

---

## `RestorationJob`

One job per **`ItemCheckIn`** (`OneToOne`, `PROTECT`). Stages: `queued → sent → bench → pending → done`, plus `returned`. (`executing` was removed.)

| Field | Role |
|-------|------|
| `scale` / `grade_values` | Ashley's prices. An item cannot go on a bench until grades are priced. |
| `intended_destination` | Where it is *meant* to end up (shelf / online_sales / storage / staff_pick). Set in the queue. Distinct from `bench_disposition` (where it actually went). |
| `timer_mode` | `look` (investigation, against the item) or `work` (against a grade). |
| `timer_grade` | Grade the work clock is aimed at. Empty while looking. |
| `look_seconds` / `work_seconds` | Kept equal to `active_seconds`. Investigation is item-level; only work time carries a grade. |
| `starting_grade` | **Original** — the grade the item arrived at. Finish `value_added` uses this, not Current. |
| `value_added` | Stamped at completion: `grade_values[final] − grade_values[starting] − spent_parts_cost`. `spent_parts_cost` is purchased + received **order** cost: Parts-category lines plus their pro-rata share of shipping, tax, and fees. Later scale edits do not rewrite it. Null jobs are excluded from rate reporting. |
| `work_session` | JSON bench draft (validated, size-capped). `benchPlan.currentGrade` is **Current** this sitting — session only, no DB column. Parts and orders are real rows, not session JSON. |

Constraint: one `bench` job per `bench_owner`. Anyone can work a job that is already on someone else's bench — staff get a warning, superuser does not get locked out. Overview and the bench deck always name whose bench it is.

---

## Money and the clock

The app does one subtraction and one division. Rows stay in scale order; the best rate is marked in place.

- **Value added** (frozen at Done): final grade $ − **Original** (`starting_grade`) $ − purchased/received order cost. An order charges the repair its **Parts** lines plus a pro-rata share of shipping, tax, and fees (by line subtotal). Supplies and FFE are bought; they do not enter this subtraction except through that freight share.
- **Live header**: value added = sells(Current) − sells(Original) − Parts spent so far (purchased/received orders). Value left = sells(best remaining grade) − sells(Current) − remaining Parts for that grade (the dearer live-order path, or $0).
- **Decision rate** on a row (WORTH): (this grade's sells-for − Parts − lowest sells-for on the scale) ÷ remaining *work* hours. The only bench estimate is minutes. PARTS is min–max of the live orders that target that grade (draft through received). Each order is its own path. One number when the paths agree, `x to y` when they do not — same for WORTH. One live request per item: a draft shows Request; Cancel on a requested order puts it back to a draft. Requesting another withdraws a `requested` sibling, or asks the owner to cancel an `approved`/`purchased` one (the replacement auto-requests when they confirm).
- **Reported rate** on the scoreboard: stamped value added ÷ hours on the item **including** looking.

Rates are judged against a **floor** (what an hour costs, default `$19.80`) and a **benchmark** (what an hour usually returns) — not one pass/fail line. Band colors on the grade table come from `rateBand(rate, floorRate, benchmarkRate)`.

---

## APIs

| Endpoint | Role |
|----------|------|
| `GET /api/inventory/restoration-jobs/` | List; filter `?stage=` |
| `PATCH /api/inventory/restoration-jobs/{id}/queue-details/` | Queue edits until the item is **finished**. Replaces the old patch that only accepted `queued` jobs (so `sent` rows were stuck). |
| `GET /api/inventory/restoration-jobs/scoreboard/` | Day / week / trailing 4-week value added, items done, $/hour. Powers Home. |
| `GET /api/inventory/restoration-jobs/returns/` | Processing FROM desk: unhandled Done + returned. |
| `PATCH …/work-session/` | Bench draft. Writes `grade.claimed` / `plan.estimate_changed` when Original, Current, or estimates change. |
| `POST …/send/` `hold/` `done/` `reject/` `return/` | Lifecycle. Done stamps `value_added` and writes `RestorationOutput` lines (seq 0 = main item). Reject reuses Done to Processing and sets `return_disposition_type=untouched`. Refuses `done/` while any order is `requested`, `approved`, or `purchased`. |
| `POST /api/inventory/restoration-outputs/{id}/create-item/` | Processing mints a salvaged-part SKU. `product_mode` `existing` (needs `product_id`) or `new` (needs `title`; optional brand / category / model / upc). Optional condition / dispatch / notes / specifications. Copies `purchase_order`, `manifest_row`, `check_in` from the parent, sets `parent_item`, requires the parent retail be reduced. |
| Grade scales | `RestorationGradeScaleViewSet` |
| `GET/POST /api/inventory/restoration-parts/` | Job parts list. Staff CRUD. Filter `?job=`. |
| `GET/POST /api/inventory/restoration-parts-orders/` | Named orders. Staff: create / edit / `request` / `withdraw` / `request-cancel` / `drop-queue` / `cancel` / `receive` / `inspect` (per-line Acceptable or Issues + note). Superuser: `approve`, `deny` (reason), `purchase` (`expected_delivery_on` or `est_shipping_days`), `eta/` (revise a purchased date), `resolve-cancel`. Filters: `?job=`, `?status=`, `?open=1`, `?needs_review=1`, `?cancel_requested=1`, `?bucket=live\|history`, `?since=`. `request/` returns 409 with `blocking_order` when a sibling is approved or purchased. Receive only marks delivered (`review_state=needs_review`). Inspect writes line `inspect_verdict` / `inspect_note`, sets `review_state=reviewed`, and appends `parts.order_inspected`. Uninspected received stays Live even after Finish. Inspected received goes to History. Old `POST …/review/` is 410 (`Use inspect.`). Payloads include `attention`, `expected_delivery_on`, `days_late`, actor names, and frozen job money. |
| `GET /api/inventory/items/{id}/notes/` · `POST` same | Item notes trail; POST is a manual note. |
| `GET /api/inventory/restoration-jobs/{id}/notes/` | Union of notes on the check-in's items. |
| `PATCH /api/inventory/item-notes/{id}/` · `POST …/void/` | Author's own manual notes only. |

Processing check-in with `dispatch=restoration` creates a `queued` job. **Every path into Restoration sends the
request** (owner, 2026-10-28; replaced the 10-26 hours / parts / value-after estimate): what it needs, which is also how
it is now (test = untested, clean = dirty, assemble = flat-packed, repair = broken, check parts = parts not checked),
and ONE typed price, the **done price** (per unit). Each other ending gets an as-is price that Dash fills in from
settings and Processing may change: untested `restoration.as_is_untested_pct` (50% of done), dirty
`restoration.as_is_dirty_pct` (70%), flat-packed done / (1 + `restoration.flat_pack_markup_pct` 10%), can't repair
`restoration.as_is_broken_pct` (30%) or scrap / parts $0, parts not checked `restoration.as_is_parts_unchecked_pct`
(60%). The API refuses without a need and the done price (`services/restoration_request.py`, sent as `restoration`;
settings for the dialogs at `GET /api/inventory/restoration-request/settings/`). Paths: Processing check-in and Edit
check-in, Check in together, the product "+" check-in, the check-in panel (create / duplicate / edit), Add item, and
the Goes-to dropdown in Prior check-ins (a small dialog, then the whole check-in moves). Item-level edits
(processing-patch, print-and-check-in, print-multiple, bulk-disposition) can no longer send to Restoration: they make no
job. An edit of a check-in already in Restoration keeps what it has, including an old estimate (old jobs keep theirs;
nothing was migrated). The request is stored on the job (`requested_needs`, `done_price`, `as_is_prices`,
`value_at_stake` = done minus the lowest as-is) and in `defaults_snapshot.restoration_request`; the `queue_note` says it
("Asked: test, repair · done $80.00 · as is $24.00 · at stake $56.00", also on the notes trail). Restoration fills in its
side: `found_needs`, asked as "What did you find?" (chips prefilled from the request) the first time a requested job is
worked on the Bench (Later skips it for the visit; `FoundNeeds.tsx`), editable on Finish's Dispatch tab (sent with `done`; also
queue-details PATCH), and the existing hours, parts and outcome fields. Stacks: `STACK_GROUP_FIELDS` copies the six
request fields to split groups as they are (money is per unit); the stack card's stake is `value_at_stake` x units. UI:
`pages/inventory/restorationRequest/`. Incomplete grade values → `needs_setup`. Dispatch away from restoration deletes
a `queued` job.

**Queue order** (owner, 2026-10-28): the queue sorts by expected gain per minute by default (any header still sorts).
`priority.per_minute` on queued jobs = value at stake x success odds / typical minutes. Odds and minutes come per need
from finished jobs of that need and category (then all categories) once there are `restoration.priority_min_jobs` (5);
until then `restoration.default_success_pct` (test 85, clean 95, assemble 90, repair 60, check parts 85) and
`restoration.default_minutes` (15 / 20 / 30 / 60 / 15). Several needs: odds multiply, minutes add. Success = Done and
not salvaged; a fail = salvaged, or sent back untouched. A job's minutes split evenly over its needs. Old jobs use
their old estimate's work and the grade spread. The row shows `$x/min` under At stake.

**Assembly holdout** (owner, 2026-10-28): `restoration.assembly_holdout_pct` (10; 0 turns it off) of new Assemble
requests are picked at random to sell flat-packed, as is. The job gets `holdout`, every unit `Item.restoration_holdout`
(for Inventory Review / analysis: price and days to sell against assembled ones), the items a notes-trail line, and the
log a line. The queue row shows HOLDOUT · SELL FLAT-PACKED.

**Restoration tag** (owner, 2026-10-28; layout A): when a check-in sends items to Restoration, each one gets the
restoration tag instead of the green price tag (it goes over blue painter's tape). Same stock and printer. A
black RESTORATION band; the QR of the plain SKU (what the scanners read now) and the SKU in big type; a short title; the
work in big words (TEST · ASSEMBLE, two lines when there are many, or HOLDOUT · SELL AS IS); SENT date and SENT BY. No
prices. `printed_items_preview` rows carry `restoration_tag` (needs, holdout, sent_on, sent_by) for items in
Restoration whose job is queued or sent, so every check-in path prints it through `printProcessingLabelsStaggered`; the
job API has the same `restoration_tag` for **Reprint** (the print icon by the SKU on the queue row, one tag per unit,
until Done). Drawn in the browser (`pages/restoration/tag/restorationTag.ts`) and printed through the print server's
`/print/image-copies` (1.4.1+), so no new print server. Since 10-28 it is laid out in proportion to the label-size
setting (see `print-server.md` § Label size): on 1.5x1 the band, QR, SKU, work and SENT/BY strip keep their room and the
title gets one line (two on 3x2) or goes.

**Queue scan takes one item** (2026-10-28): scanning a SKU into the queue (`POST /restoration-jobs/ {sku}`) moves only that item into its own check-in and job; its check-in mates stay where they were. Before, one scan sent a whole check-in (12 spinners on PO 420, 2026-10-27). **Undo check-in** in the queue's history drawer (queued or sent items) moves the whole check-in elsewhere or deletes it; see `inventory-pipeline.md` (Undo check-in).

---

## Restoration list (E3, 2026-10-21)

`GET /api/inventory/restoration-jobs/tracking/?scope=open|done&days=30` (`services/restoration_tracking.py`). Nothing new
is recorded; it reads what the job already holds.

- **Path** = the kinds of bench work logged (`RestorationAction.category`): tested, assembled, repaired, salvaged,
  each with the day first done; a part line sent to salvage counts as salvaged. Inspection alone is not a step.
- **Next** = `bench_disposition` (back to processing, back stock, salvage, online), or before that the intended
  destination ("Meant for shelf"); returned untouched = back to processing.
- **Landed** = the main item after Processing checks it back in (`processing_handled_at`): floor, back stock, online,
  salvage, sold.
- **Days** in restoration (sent → checked back in, or now) and in the current stage (stage stamps: `created_at`,
  `sent_at`, `bench_started_at`, `pending_started_at`, `dispositioned_at`, `returned_at`). Open = not yet checked back
  in, so Done items waiting for Processing stay on the list ("Waiting for processing").

## Surfaces

**Notes trail** (`ItemNotesTrail`, `NotesBadge`, `ItemNotesDrawer`): append-only `ItemNote` keyed to the item, not the job. Scalar fields (`queue_note`, `pending_notes`, finish brief, …) stay authoritative for the current value; the ledger is the history. Dual-written from check-in, handoff, queue-details, describe-action, hold, send-back, reject, finish, outputs, and Processing FROM. Manual composer on the quick-grade form, queue badge, bench Last note / Add note, Overview history, Finish, and Check in from Restoration. Enter submits; click a manual note to edit (Enter saves, Escape cancels). You can only trash or edit your own comments, and only when every later action and comment is also yours — including after Done / check-in. Both ledgers go; every surface refreshes. Grade and estimate history stays closed once the job is finished. Hold / reject / finish / send-back and the FROM desk show a reserved-height trail with the same reserved trash. Split/combine can delete jobs; notes stay. `Item.notes` is still the printed-tag note.

**Overview rows** (2026-10-28): a job with several items shows one row per item, all with the same job id, so each row is keyed by job + item (`queueRowKey`). Keying by job id alone left stale rows on screen after a tab switch, and their pickers did nothing. On phones the four tabs share the strip so Done is never off-screen.

**Queue card** (`RestorationQueueCard`): name, SKU, whose bench (first name, reserved dash when it is not on a bench), what Processing saw, retail, note, destination, days waiting, value at stake (best − worst grade). Sort: items anyone can unblock first, then most money, then age. Same component on `/restoration/overview` and TARS Home. Next is a reserved button strip (Queue: Open / Hold / Finish; Bench: Queue / Hold / Finish; Holding: Queue / Open / Finish; Done: Check in / Back to Queue). Blocked buttons stay on the strip and explain. Bench chrome opens the bench; the notes badge still opens What was done. Back to Queue from Done requires a note.

**Bench visual system** (`studio/benchScale.ts`): the only place a bench colour, type size, gap, or slot height may be invented. Dark deck is graphite-green (`DECK`); paper panels are sage-white (`PANEL`); six type roles (`TYPE`); 4px spacing (`SP`); reserved heights (`SLOT`). Queue / home screens still read `tarsStudioTheme.ts`. Shared pane chrome is `BenchPaneHeader`.

**Bench** (`TarsWorkstation`): a command deck (`TarsBenchConsole`) sits above the work — four panes: item details, a compact Original → Current over centered Value added / Value left readouts, a Recent notes list (author · date/time, then one truncated line; fills down to Add note with no scroll; click opens the drawer), and Queue / Hold / Reject / Finish with the notice lamp. Someone else's bench is a warning, not a lock. Superuser can work any bench. Hold is a story of pieces: Buy is auto-added from live parts orders (`requested` / `approved` / `purchased`); the user can add Time / Space / Help / Other, each with a description. Where it sits is Holding Rack or freeform. The right column is the standard notes surface (history plus Add). No hold-note field - the assembled story is written to the item notes ledger. Same dialog on Overview. Submit needs at least one piece. Reject asks for a reason and sends the item to Processing as untouched. Finish is three tabs (Dispatch / Notes / Actions). Dispatch is four stat cards (Item, Grade, Value added, Cost) and a Main / Additionals table (Item, Dispatched to, Notes for dispatch). The as-is disclaimer chooser is gone — Processing reads the final grade and the notes. Notices open a top drawer. The page itself never scrolls: `/restoration/bench` locks `overflowY` on `MainLayout`. Below the deck, the main area is a 50/50 split on the left (wider) column. Top: grade table (`GRADE | SELLS FOR | PARTS | MINS | WORTH` — no item row, no AT, no Work) with a `BenchPaneHeader` (Scale) and its own thin scrollbar. Bottom: Parts list and Purchase orders side by side (`TarsPurchaseDesk`), each with a `BenchPaneHeader` (count · total always rendered) and its own thin scrollbar. Add order still opens `TarsPartsOrderDialog`. PARTS on a grade row is a readout; when it comes from orders, a click scrolls that grade's tiles into view. Right: a work-log card — current action (type is a press-to-pick, default Inspect), a reserved detail row, two full-width filter bars, a When / Who / What / Detail column header, and one merged past history (`tarsBenchHistory.ts`). An empty current-action slot is the same height and says "Log an action". Work row is Actions, a divider, then Inspect–Salvage. Desk row matches that shape: Non-actions, a divider, then Notes / Grades / Estimates / Parts / Progress. Each past line is when, who, what (coloured by type), detail, and a reserved trash slot. Per-row trash voids your own comment on both ledgers when every later action and comment is also yours — later grade or estimate events do not lock. Someone else's note stays. The current queue note asks Reset note? and puts the live note back to what it said before. First claim on either empty selector sets both Original and Current; after that they are independent. Actions are on the item, not on a grade.

**Grade table** (`TarsGradeTable`): one row per scale grade. Ashley's price is given; Mike answers minutes on every grade, including Original and Current. Original is slate and Current is green — same pair as the command-deck pickers. PARTS and WORTH come from the orders for that grade — a range when two paths disagree.

**Parts** (`TarsPurchaseDesk`, `PartsCommandCenterPage`): the job has a flat parts list (`RestorationPart`, category on the line) and named orders (`RestorationPartsOrder`) that each target a grade. Both live on the bench as PARTS / ORDERS panes (Add line / Add order). Only one order can be live (`requested` / `approved` / `purchased`). Superuser sequence: Accept / Deny → Mark ordered (delivery date) → Delivered → inspect. A purchased date can be revised via `eta/`. **Received** on the command center *is* the inspect form (`PartsReceiveInspectForm`): compact order facts, then Acceptable / Issues per bought line (qty is one row; Issues needs a note). Save stays disabled until every line is marked. The bench ORDERS pane keeps the same reserved form for a received-uninspected order. Inspect moves the order to History. Finish is blocked while an order is still requested, approved, or purchased. The Parts Requests nav badge (`useNavBadgeCounts` → `partsNavWaitingCount`) reads the live bucket so it drops when the last approval, cancel ask, or review is handled. Associate rules: [`.ai/reference/tars/parts_orders.md`](../reference/tars/parts_orders.md).

**Scoreboard** (`TarsScoreboard`): TODAY / THIS WEEK / WEEKLY AVG in reserved slots so the strip never changes height.

**Processing hub** (`/inventory/restorations`): TO panel (scale/values + handoff) and FROM desk (Worked / Untouched). Rejected jobs paint Untouched. Check in from Restoration is one dialog (`RestorationReceiveDialog`) for the main item and each pending additional — same dialog Overview Done uses. It remaps the main SKU when asked, mints part SKUs (`create-item`), then checks in the main item.

**Receive** (`RestorationReceiveDialog`): three tabs — Receive / Notes / Actions — the same pair of history tabs the Finish form has, at the same fixed body height so switching never resizes the dialog. Nothing scrolls at a normal window height.

The Receive tab is static on top, tinted check-in cards below. Static is two cards: `ReceiveItemCard` (name, SKU · product number, brand / model and retail / condition in a 2×2, then what restoration said) and `ReceiveGradesCard` (the grade ladder they were priced against; a star on the grade reached, a blue left border on original; tapping a priced row writes that price into whatever is being received). Dynamic is `ReceiveCheckInForm`: Product (original / edited / changed / new) with Edit / Change / New — those become Save / Cancel while working — Condition and Dispatch side by side, Retail & price, Notes (Specs on that row). Dispatch chips say On Shelf; “restoration said …” sits right-justified on that card. Washes are green / kraft / grey so the tasks read as separate without numbers. Step pills sit in the header and Back / Next in the footer, both only when the job has additionals; the retail split rail sits in the footer beside them and warns by colour when the split does not balance.

A part leaving as salvage skips the catalog: same product and money slots, different copy, `$0` / `$0`, and no retail share off the main item. `create-item` accepts `product_mode=none` only with salvage dispatch; the SKU attaches to the reserved sink product `PRD-SALVAGE`. The main item keeps its product; salvage there is `$0` in the same reserved money slot.

Main item SKU stays; a destroyed item can be remapped (`POST …/items/{id}/remap-product/`, including `product_mode=new`). Submit remaps if needed, mints parts (decreasing `parent_retail` only for shelf-bound additionals), then `POST …/processing-check-in/`, then prints. No as-is disclaimer gate.

**Processing workspace:** check-in with `dispatch=restoration` stays on the Processing page. After print, `TarsQuickGradeDialog` sets scale, grade values, destination (default Shelf), and note. `starting_grade` is the lowest-value grade on the scale so value added is measurable.

---

## Stacks (Bill OK'd 2026-10-28; phases A and B built)

Bill: products with several units show as one stack with a number; decisions are made once for the group; a stack
can be split; scanning a unit opens its stack so the whole group can go on the Bench.

**What is true today.** A job is one check-in, and a check-in can hold N units (`quantity`, `items`). Scale, grade
prices, destination and note are already on the job, so they already apply to every unit. Prod has two such jobs this
week (12 units, 3 units). The split and combine APIs exist (`split/`, `combine/`, queued/sent only) but no screen uses
them. The intake forms refuse quantity > 1 for Restoration, and Bench / Finish refuse a stack ("takes one item at a
time").

**1. A stack is a job with more than one unit.** The one new field is the job's family (the job a group was split from), so groups from one split find each other. It forms when Processing sends N units of
one product in one check-in (the intake forms stop forcing quantity 1). Loose single jobs of the same product and the
same order in the Queue get a small "Stack these 2" button (the existing combine). Nothing is ever stacked without a
click.

**2. What it shows.** The same queue card with two offset card edges behind it and a count badge (×12) on the corner.
Columns read once for the group: Note, Destination, Scale and prices, value at stake ×N. Same height as a single card,
so nothing shifts.

**3. Group actions.** Every row action already works on the job, so it covers all units: destination, scale, prices,
note, Hold, Finish, Back to Queue. Print reprints all N tags. Each unit keeps its own SKU.

**4. Opening a stack.** Click the badge: the card opens in place to a list of units (SKU, tag note, Pull out). Phone:
a bottom sheet with the same list. A unit row opens the Item modal (lane P4).

**5. Splitting (one Split dialog, three tabs).** *Equal groups* (N groups; leftovers go to the first groups), *Pull out*
(take N into a new group, or tick the units), *Groups of* (groups of N; the remainder is its own group). The dialog
draws the result as little stacks before you press Split. Each new group keeps scale, prices, destination, note and
estimate. Groups from a split stay together: they sort next to each other under one family line ("12 units · 3 groups")
and fold into one stack when collapsed. A group on another tab says "Group 2 of 3 · others in Bench".

**6. A unit goes different.** Pull out on that unit makes it a group of 1 with the same decisions; then change it.

**7. Scanning.** A scan of a unit in a stack opens that stack with the unit highlighted and two buttons: **Put the whole
group on the Bench** (primary) and **Just this one** (pulls it out and puts it on the Bench).

**8. A whole stack on the Bench.** The bench works the group as one item: one clock, one grade table, parts for the
group. Money is per unit × N (value added = N × (final − original) − parts). Finish sends all N to Processing at the
final grade; Receive checks them in together with one form.

**9. Undo.** After a split the snackbar offers Undo (stacks them back). Any time later, "Stack back together" on the
family line rejoins groups that are on the same tab.

**Built in phase A.** `stack_family` on `RestorationJob` (plain id). `split/` copies stage, `sent_at`, `created_at`,
scale, grade prices, destination, note and the Processing request fields (`STACK_GROUP_FIELDS`; names not on the model
yet are skipped) and puts every group in the first stack's family. `combine/` takes queued or sent cards at one stage.
Processing and Add item no longer refuse quantity > 1 for Restoration (the forms are P5's). The Overview gets one card
per job (the old one-row-per-unit expansion is gone). Front end: `queue/stackModel.ts` (split plans, clusters),
`StackPanel.tsx`, `SplitStackDialog.tsx`, the `StackCluster` line in `RestorationQueue.tsx`. Stake on a stack =
per-unit stake × units. A scan of a stack unit (Overview or Bench) opens `/restoration/overview?job=…&unit=…`. Splits
happen on the Queue tab only; other tabs open the list read-only. Families sit together but do not fold into one card.

**Built in phase B.** `check-in/` without `item_id` puts the whole stack on the bench (with `item_id` it still splits
that unit off). `done/` takes a stack and moves every unit; it refuses salvaged-part lines on a stack ("Pull that unit
out of the stack first"). `compute_value_added` = units × (final − original) − parts; the bench header, grade-table
WORTH, and Finish use the same rule (`jobUnits` in `tars/tarsBenchValue.ts`). The scoreboard counts units, not jobs.
Receive already remaps and checks in every unit; the dialog says "A stack of N to receive". Overview's open stack has
**Put the whole group on the Bench**.

**Take out of queue** (Bill, 2026-10-28): the Overview history drawer's button for a queued unit or stack (P2's Undo
check-in now lives only in Processing → Prior check-ins). Two choices, `POST …/take-out/` `mode`:
`given_back` (reason required) or `no_work` (then the Receive dialog opens: destination, price, tags). Both close the
job to Done as untouched (`return_reason` = the mode, `return_notes` = the reason); the items stay on their check-in and
go back to Processing. Done cards say "Given back to Processing · reason" or "Checked in, no work"; Prior check-ins shows
Restoration's note under Dispatch while the check-in is back with Processing. Refused once Bench work has started.
Logged by the finish timeline event and the notes trail (`services/restoration_bench.py`
`take_restoration_job_out_of_queue`, `queue/TakeOutOfQueueDialog.tsx`).

**Build order (each ships alone).** A: stack card, open, three splits, pull out, scan opens the stack, stack back
together, intake allows N, Stack these. B: whole stack on the Bench, Finish and Receive for N units.
Processing lists: the ×N badge on restoration check-ins only; splitting stays in Restoration.

---

## Frontend map

- Pages: `frontend/src/pages/restoration/` — `RestorationLayout`, `queue/RestorationQueuePage`, `queue/RestorationReceiveDialog` (+ `ReceiveItemCard`, `ReceiveGradesCard`, `ReceiveCheckInForm`, `ReceiveProductPicker`, `ReceiveHistoryPanes`), `RestorationBenchPage`, `parts/PartsCommandCenterPage`, `tars/TarsHome`, `tars/TarsBenchConsole`, `tars/TarsGradeTable`, `tars/TarsPartsListPanel` (`TarsPurchaseDesk`), `tars/TarsActionHistory`, `tars/TarsScoreboard`, `tars/TarsDoneDialog`. Bench tokens: `tars/studio/benchScale.ts`. Shared pane header: `tars/studio/BenchPaneHeader.tsx`.
- Notes: `frontend/src/components/notes/` — `ItemNotesTrail`, `ItemNoteComposer`, `ItemNotesDrawer`, `NotesBadge`. Hooks: `useItemNotes.ts`.
- Hooks: `frontend/src/hooks/useRestorationBench.ts` (scoreboard query key `['restoration-scoreboard']`). Nav badges: `frontend/src/hooks/useNavBadgeCounts.ts` (live parts list).
- Enhancement asks: `frontend/src/components/enhancements/RequestsDrawer.tsx` (bench + Processing). Superuser board: `frontend/src/pages/admin/EnhancementRequestsPage.tsx`.
- Backend: `apps/inventory/models.py` (`RestorationJob`, `RestorationOutput`, `ItemNote`, `Item.parent_item`, `RestorationPart`, `RestorationPartsOrder` + line `inspect_verdict` / `inspect_note`), `services/restoration_bench.py`, `services/item_notes.py`, `services/restoration_parts.py`, `services/tars_value.py`, `views.py` `RestorationJobViewSet` / `RestorationOutputViewSet` / `ItemNoteViewSet`. Timeline allowlist includes `parts.order_inspected`.

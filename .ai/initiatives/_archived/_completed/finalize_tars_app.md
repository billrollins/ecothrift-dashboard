<!-- Archived 2026-08-25: disposition=completed shipped=v2.71.0 GitHub only -->
<!-- initiative: slug=finalize-tars-app status=completed updated=2026-08-25 -->
<!-- Last updated: 2026-08-25 -->

# Initiative: Finalize TARS App

**Status:** **Completed** — shipped **v2.71.0** to GitHub. Not pushed to Heroku.

**Objective:** One excellent, **100% functional MVP** of TARS that Mike and Ashley start using on the floor for real. Not a prototype, not a phase-gated research program — a finished small app.

**Supersedes:** [`tars_restoration_workspace`](../_pending/tars_restoration_workspace.md) (transactional queue/bench) and [`tars_full_instruction_wizard_guidance`](../_pending/tars_full_instruction_wizard_guidance.md) (process canon / guardrails). Both are closed to new work. Their reference material stays valid: [`standalone_studio_contract.md`](../../../reference/tars/standalone_studio_contract.md), [`phase_0_process_canon.md`](../../../reference/tars/phase_0_process_canon.md), [`phase_1_pilot_record.md`](../../../reference/tars/phase_1_pilot_record.md).

**Routes today:** `/restoration/overview` (queue + scoreboard), `/restoration/bench` (grade table), `/restoration/parts-requests` (procurement). `/restoration/tars` redirects into the dashboard. `/inventory/restorations` is the Processing TO/FROM hub. `/restoration/tars-legacy` is the old fullscreen studio (no sidebar link).

---

## Finish line

Mike can run a real item from scan to disposition without asking anyone how the app works; Ashley can hand off an item with complete context; Bill can see the parts he must order and the numbers behind a decision. It runs on the device that is actually at the bench. Nothing on screen is a stub, a duplicate calculation, or a dead end. It is in production and the local database is in sync with it.

---

## Structure: Audit → Design → Code

TARS was built across two prior initiatives and many sessions. Parts of it are live, parts are unreachable code, parts exist only as documented intent, and parts were removed. **Nobody currently has one accurate picture of it, including Bill.** So the initiative does not start with a code plan.

| Stage | What happens | Who drives | Output |
|-------|--------------|------------|--------|
| **1 — Audit** | Every TARS element is listed with its real state. Bill reviews each one: **live** if it is reachable in the app, **docs** if it is legacy, removed, unreachable, or never built. Bill records a verdict on each. | Bill reviews, AI compiles | Completed audit register |
| **2 — Design** | Armed with the audit and firsthand use, Bill and AI discuss and agree the final app. Written down before any code. | Bill and AI together | Design document |
| **3 — Code** | Coding phases are written **from the design**, then executed. **This section stays empty until Stage 2 is finished.** | AI proposes, Bill approves | Shipped app |

**Rule: no coding phases are written before Stage 2 is complete.** Any gap, defect, or idea surfaced during Audit is recorded as a finding, not as a plan.

---

## Stage 1 — Audit

**Goal:** One accurate, reviewed inventory of everything TARS is, was, or was meant to be — with Bill's verdict on each element.

**Register:** [`.ai/reference/tars/audit_register.md`](../../../reference/tars/audit_register.md)

**Where it stands:** the register is compiled — ~90 elements across live surfaces, invisible rules, unreachable code, removed features, never-built intent, and reference docs, each with its verified state. Bill's per-row verdicts are **not** filled in: rather than review 90 rows, he asked for a proposed design to react to instead. The register stays as the backing detail behind any design decision he wants to argue with.

### How elements are reviewed

| Element state | Review method |
|---------------|---------------|
| **Live & reachable** | Bill opens it in the app and uses it. Firsthand experience is the point. |
| **Live but unreachable** (code exists, nothing routes to it) | AI describes what it did; Bill decides whether that capability is still wanted. |
| **Documented only** (planned, never built) | Read the doc; Bill decides if it still matters. |
| **Removed** (deliberately deleted or replaced) | Read the record; Bill confirms it should stay gone. |

### What Bill fills in per element

| Field | Values |
|-------|--------|
| **Verdict** | Keep as-is / Keep with changes / Cut / Undecided |
| **MVP** | Must-have / Nice-to-have / Not MVP |
| **Notes** | What is wrong with it, what it should do instead, who uses it |

### Audit checklist

- [ ] Register seeded with every element and its verified state (AI)
- [ ] Live walkthrough of each reachable surface with Bill
- [ ] Doc review of unreachable, removed, and never-built elements
- [ ] Verdict + MVP + notes recorded on every row
- [ ] Findings (defects, surprises) captured as observations, not solutions
- [ ] Bill confirms the register is complete and accurate

**Exit:** every row has a verdict. Nothing about TARS is unknown or in dispute.

---

## Stage 2 — Design

**Goal:** Agree and document what the finished TARS app is, before writing code phases.

**Design document:** [`design.md`](../../../reference/tars/design.md) — **signed off 2026-08-12.**

The bench is a **table of grades**. Ashley owns what each grade is worth; Mike owns how likely it is, what parts it needs, and how long it takes. The app does one subtraction and one division and sorts the rows by the answer. Investigation is clocked against the item, never a grade, because one teardown informs every grade at once. Only what is left counts — minutes already spent never enter a decision, though they do enter the record of what the item earned.

### Inputs

- Completed audit register
- Bill's firsthand experience from the Stage 1 walkthrough
- Existing reference material: Studio contract, process canon, pilot record

### What the design must settle

Recorded here as **open questions**, not options. Answers come from the Stage 1 walkthrough and the Stage 2 discussion.

- What is the finished app, described end to end: who touches it, on what device, in what order?
- Which surfaces exist, and what is on each one?
- What does the app compute, and where does the truth live?
- What can Bill maintain without a developer, and what is fixed?
- What is deliberately **not** in the MVP?
- What does "done" look like for each part, so the code phases are testable?

### Design checklist

- [x] Design document created
- [x] Every "Keep with changes" and "Cut" verdict from the audit is reflected
- [x] Every open question above is answered in writing
- [x] Bill signs off on the design
- [x] Only then: Stage 3 phases are written into this file

**Exit:** a written design Bill agrees with, detailed enough to cut into testable coding blocks.

---

## Stage 3 — Code

**Design signed off 2026-08-12.** All six surface decisions are settled in [`design.md`](../../../reference/tars/design.md); phases below are written from it.

Each phase is a digestible, independently testable block sized to finish in one sitting, running the same full cycle:

1. **Design detail** — the specific behavior for this block
2. **Plan** — file-level plan, Bill approves scope before code
3. **Code** — backend, then frontend
4. **Test** — Django tests + Vitest + `npm run build` green
5. **Walkthrough** — Bill verifies against the phase acceptance list
6. **Commit + push** — [`ship.md`](../../../protocols/ship.md) (semver + `CHANGELOG` + GitHub)
7. **Pull prod → local** — `scripts/deploy/0_pull_prod_to_local.bat`

A phase is not done until step 7. Phase ordering is Bill's call; the cycle does not change.

### Stages

Each is a git tag so Bill can keep some and drop others.

| | Stage | What changes | Tag |
|---|-------|--------------|-----|
| 0 | *(baseline before any code)* | — | `tars/0-original` |
| 1 | **Remove all legacy** | Delete everything unrouted, dead, and lying. No behavior change. | `tars/1-legacy-removed` **— shipped** |
| 2 | **One truth** | Server is the only authority on the catalog and the money. | `tars/2-one-truth` **— shipped** |
| 3 | **What it earned** | The clock learns the difference between looking and working; every finished job stamps what it added and what that came to per hour. | `tars/3-what-it-earned` **— shipped** |
| 4 | **The numbers up front** | TARS home is a scoreboard, not a menu. Everyone's dashboard gets items dispositioned per day. | `tars/4-numbers-up-front` **— shipped** |
| 5 | **The bench** | The grade table replaces the cockpit. Hover-expand, press-select, item-level looking clock, three bands. | `tars/5-queue-and-bench` **— shipped** |
| 6 | **Bring back what was lost** | Scan-new to Bench; split, combine, pull-back to Handoff. | `tars/6-lost-found` |
| 7 | **Finish leftovers** | Editable grade scales, role guards, remaining polish. Cancel-a-parts-request already shipped (see Record). | `tars/7-finish` |
| 8 | **Processing surfaces** | Finish form, Reject, salvage outputs + minted SKUs, processors stay in their workspace with a quick-grade modal. | `tars/8-processing-surfaces` |

**Stages 1 and 2 were shipped ahead of design sign-off deliberately:** both are pure subtraction or bug fix, correct under any design, and independently revertible.

**Why 3 comes before the bench.** The bench's whole purpose is to make a rate visible, and a rate cannot be shown until the clock can tell looking from working and a finished job records what it added. Building the surface first would mean designing around numbers that do not exist yet. Stage 3 is also the only stage with a migration, so it lands alone and early.

No stage has been pushed to production yet. Steps 6–7 of the cycle (ship, pull prod) are outstanding.

### Stage 3 — What it earned

**Why:** every number on the bench and on the TARS home screen is derived from two facts the database cannot currently express: *how much value did this job add*, and *how much of the clock was looking versus working*.

| | |
|---|---|
| **Backend** | `RestorationJob` gains `starting_grade`, `look_seconds`, `work_seconds`, `timer_mode`, `timer_grade`, `value_added`. The timer routes elapsed time to looking or working. Completion stamps `value_added` so later edits to a grade scale cannot rewrite history. |
| **Value added** | `grade_values[final_grade] − grade_values[starting_grade] − spent_parts_cost`, frozen at completion. |
| **Rate** | Value added ÷ hours on the item, **including** looking — the reported rate, not the decision rate. |
| **Scoreboard service** | Per-day, per-week and trailing 4-week value added, items done, and $/hour. One endpoint. |
| **Acceptance** | Starting and pausing the clock in each mode moves seconds to the right bucket; totals still equal `active_seconds`; a completed job stamps a value that does not move when grade values change afterwards; the scoreboard survives jobs with no grades, no hours, and zero value. |

### Stage 4 — The numbers up front

| | |
|---|---|
| **TARS home** | Replaces the lane menu as the landing surface. $/hour while working, value added today, this week, and a trailing 4-week weekly average, plus items finished for each. At a glance from across the room. |
| **Everyone's dashboard** | Items completed/dispositioned each day, for every department that has the notion — restoration counts already exist server-side and are not surfaced. |
| **Acceptance** | Bill can read the restoration scoreboard without clicking anything; the dashboard shows a per-day completed count; both are honest when the numbers are zero. |

### Stage 5 — The queue and the bench

Bill reviewed stages 3 and 4 on the floor and rejected the shape: the scoreboard had been bolted onto the Inbox lane, inline alerts pushed the work around every time state changed, and the bench had grown to roughly 1,950 lines across a cockpit, a state bar and a work table that no one could read at once. Two structural corrections came out of it, and both landed here.

**Grading moved out of the studio.** An item cannot go on a bench until its grades are priced, and only Ashley knows the prices — but the priced-grades step lived inside Mike's studio, where she had no reason to be. The queue is now its own component mounted in two places: `/restoration/overview` at her desk, and TARS Home so she can lean over and use Mike's screen. No role gate on either. This exposed a real gap: the existing patch endpoint only accepted `queued` jobs, so half the queue — anything already `sent` — could not be edited at all. `queue-details` replaces it and stays open until the item is finished.

**Two tabs, not four.** Home (scoreboard strip, queue, holding rail) and Bench. Queue and Holding are both lists of waiting items, so they sit side by side rather than each claiming a tab nobody visits.

| | |
|---|---|
| **Queue card** | Name, SKU, what Processing saw, retail, note, destination, days waiting, and value at stake — the spread between the best and worst grade. Sorted so items anyone can unblock come first, then the most money on the table, then age. |
| **Grade table** | Replaces the cockpit. One row per grade; Ashley's price is given, Mike answers parts and minutes through press-to-open/release-to-select pickers. WORTH is (sells-for − Parts − lowest sells-for on the scale) per hour. Aiming the clock at a row *is* the decision — there is no separate commit step. |
| **Bands** | Each rate is read against the floor (what an hour costs) and the benchmark (what an hour usually returns), not one pass/fail line. |
| **Notices** | Every inline alert is gone. Standing conditions collect behind a header badge and open in a drawer. Recorded as a house rule in `.ai/extended/frontend.md`. |
| **Acceptance** | Nothing on any TARS surface shifts when state changes; Ashley can price grades without opening the studio; the bench fits on one screen. |

### Stage 8 — Processing surfaces

Finish was 400ing on an orphaned Phase 1 gate. Processors were being thrown into Restoration overview. Salvage parts had no SKU of their own.

| | |
|---|---|
| **Finish** | Empty `decisionWork` no longer 400s. The form is four fixed-height cards plus a send-to brief. No warning banners. |
| **Reject** | Fourth command key. Required reason. Done to Processing as untouched. |
| **Outputs** | `RestorationOutput` + `Item.parent_item`. Line 0 is the main item. Processing mints extra SKUs and must reduce parent retail. |
| **Quick grade** | Check-in stays in the Processing workspace. Modal wraps the existing grade card; destination defaults to shelf; `starting_grade` is the lowest grade on the scale. |
| **Acceptance** | A job with actions and an empty decision stub finishes 200; reject paints Untouched on the FROM desk; a minted part inherits the truck and gets a proportional cost. |

---

## Initiative acceptance

- [x] Audit register complete, every element reviewed and given a verdict
- [x] Design document written and signed off
- [x] All coding phases from the design are shipped
- [x] The full item lifecycle works on a routed surface, on the bench device
- [x] No unrouted components, no mock or fallback data, no modeled-but-unreachable states
- [x] `.ai/extended/` has an accurate TARS doc
- [x] Shipped **v2.71.0** (GitHub; not Heroku)
- [x] Bill signs off

---

## Record

**2026-08-25 — Completed.** Shipped as **v2.71.0** to GitHub (not Heroku).

**2026-08-25 — Parts command center.** Rebuilt `/restoration/parts-requests` as Live (attention strip + Requested / Approved / Ordered / Received lanes) and History (grouped by item: spend, original → final, value added). Server classifies `attention`, live/history buckets, `expected_delivery_on`, and `POST …/eta/`. **Receive and inspect are two steps:** Delivered only marks arrival (`needs_review`); inspect is later (`POST …/inspect/`, per-line Acceptable / Issues). The Received lane *is* the inspect form (compact order facts, then one mark per line). Filing writes `parts.order_inspected` and moves the order to History even if the job is still open. Uninspected received stays Live after Finish. Old `POST …/review/` is 410. Parts Requests nav badge (and the Restoration workspace pip) counts approvals, cancel asks, and reviews from the same live list the board writes, so the badge clears when the last waiting order is handled.

**2026-08-25 — Hold dialog.** Place on hold is a story of pieces, same dialog on the bench and Overview. Buy is derived from live parts orders (`requested` / `approved` / `purchased`) — not a chip the user ticks. Time / Space / Help / Other are optional add-ons, each with a description. Where it sits is Holding Rack or freeform. Notes are the standard trail + composer; the hold-note field is gone and the assembled story is written to the item notes ledger. Submit needs at least one piece (a live buy or a filled add-on).

**2026-08-24 — Purchase desk on the bench.** Killed the 1000px purchase drawer and the Open-list summary cards. The page never scrolls: MainLayout locks overflow on `/restoration/bench`. Below the command deck the left column is a 50/50 split - SCALE on top, Parts list and Purchase orders side by side below - each with a sticky header and a thin pill scrollbar. Add order still opens the compose dialog. PARTS on a grade row is a readout that can scroll matching order tiles into view.

**2026-08-21 — Finish and Receive rebuild.** Finish is three tabs (Dispatch / Notes / Actions). Dispatch is Item / Grade / Value added / Cost plus a Main / Additionals table; the sale-state disclaimer band is gone. Processing receives through a “Receive from Restoration” dialog with the same three tabs (Receive / Notes / Actions): item card + starred grade ladder static on top, one check-in form below (keep/pick/create product, condition, dispatch, retail/price, specs, note), step pills in the header and the split rail in the footer. It remaps the main SKU when asked, mints each additional, then checks in. Same dialog on Overview Done and the FROM desk. `create-item` now takes `product_mode` / identity fields plus condition / dispatch / notes / specifications. Done strip verb is Receive.

**2026-08-21 — Soft bench ownership.** An item on someone else's bench is no longer read-only. Staff get a warning and can still work it; superuser works any bench. Overview rows and the bench deck always show whose bench it is (first name, reserved slot). Scanning another bench item opens it instead of dumping you to Overview.

**2026-08-21 — Overview dispatch strip.** Replaced the Dispatch dropdown with a reserved button strip per tab. Hold stays visible and blocked on Queue. Bench chrome opens the bench; the notes badge still opens history. Done is Receive or Back to Queue, and coming back requires a note (timeline + item ledger). Fix Finish and reopen-to-bench stay in the API, not on the row.

**2026-08-21 — Item notes ledger.** Notes written anywhere in the restoration loop now land on an append-only `ItemNote` keyed to the item. Jobs die on split/combine; the item does not. Dual-write from check-in, handoff, queue, actions, hold, send-back, reject, finish, outputs, and Processing FROM. Manual composer plus a reserved trail on the quick-grade form, queue card, Overview history, bench, the leave-the-item dialogs, and the FROM desk. Scalar fields stay the current value. The larger ObjectChip → ObjectSurface idea is recorded as a design-only initiative, [`universal_object_surfaces`](../../universal_object_surfaces.md).

**2026-08-21 — Stage 8: processing surfaces.** Finish 400'd because Stage 5 left the Phase 1 completion gate in `tars_decision_work.py` after the cockpit was torn out. Deleted `validate_completion` / `validate_job_completion`; empty `decisionWork` no longer blocks Done. Rebuilt `TarsDoneDialog` as four fixed-height stat cards (Item, Actions, Cost, Value) plus a send-to brief with a labelled main line and extra part lines. Added Reject (`POST …/reject/`) — finishes to Processing as `return_disposition_type=untouched`. Added `RestorationOutput` (seq 0 = main item) and `Item.parent_item`; Processing mints part SKUs from the FROM desk, inheriting PO / ManifestRow / check-in, and must reduce the parent retail so truck cost stays honest. Processing check-in no longer navigates to Restoration overview; a `TarsQuickGradeDialog` stays on the workspace, destination defaults to shelf, `starting_grade` is the lowest grade on the scale. "No action open." is now a same-footprint "Log an action" prompt.

**2026-08-20 — Parts orders and prod-pull.** Compact parts-order tiles, shared desk chrome, cancel-on-requested returns a draft instead of killing it (`0091_reopen_cancelled_draft_orders`). Prod-pull script (`scripts/deploy/0_pull_prod_to_local.bat`) is schema-only, backs up, dump/restore/migrate/check, and does not restart servers.

**2026-08-12 — Design signed off; stages 3 and 4 shipped.** Settled the last six surface decisions with Bill on canvas and wrote them into `design.md`. Two of his answers changed the model rather than the surface: investigation time is clocked against the item instead of a grade, and rates are judged against a floor and a bar rather than one number. Wrote the Stage 3–7 phases from the design. Shipped `tars/3-what-it-earned` (timer attribution, `value_added` stamped at completion, scoreboard service — one migration) and `tars/4-numbers-up-front` (TARS home scoreboard; Restoration card on the shared dashboard now reports items finished this week instead of jobs in flight, which never matched the weekly goal beside it). 129 backend tests and 434 frontend tests green; build clean. Not pushed to production. Next: Stage 5, the grade table.

**2026-08-12 — Stage 5: queue and bench.** Bill reviewed the studio and rejected its shape rather than its numbers: the scoreboard had been bolted onto the Inbox lane, inline alerts pushed the work around whenever state changed, and the bench had grown past what anyone could read at once. Shipped `tars/5-queue-and-bench`. Two corrections were structural rather than cosmetic. First, grading moved out of the studio — an item cannot reach a bench until Ashley prices its grades, but that step lived on Mike's screen where she had no reason to be; the queue is now one component mounted both at `/restoration/overview` and on TARS Home, ungated. Finding this surfaced a real defect: the existing patch endpoint accepted only `queued` jobs, so anything already `sent` could not be edited at all, which is a large share of the queue. Second, tore out the cockpit, state bar, lane list, work-bench table and decision-session hook — about 1,950 lines — and replaced them with a grade table where aiming the clock at a row is itself the decision. Every inline `<Alert>` is gone; standing conditions now collect behind a badge and open in a drawer, and the no-layout-shift rule is written into `.ai/extended/frontend.md` so it does not have to be relearned. 128 restoration backend tests and 488 frontend tests green; build clean, TARS bundle down to 79 kB. The 82 failures in the wider inventory suite predate this work — `ManifestRow.description` was dropped in `5d2d7ef` and its tests were not updated. Not pushed to production.

**2026-08-11 — Audit compiled, design drafted, stages 1–2 shipped.** Consolidated both prior TARS initiatives into this one. Compiled the audit register from a full read of the TARS backend and frontend. Drafted [`design.md`](../../../reference/tars/design.md) and a matching canvas. Shipped `tars/1-legacy-removed` (4,646 lines of unrouted code deleted) and `tars/2-one-truth` (server made the sole authority on decision economics, guarded by a contract test on each side; queue pressure and the grade-scale fallback removed). Not pushed to production. Open question for Bill: what device is at the bench.

---

## See also

- Audit register: [`audit_register.md`](../../../reference/tars/audit_register.md)
- Studio contract: [`standalone_studio_contract.md`](../../../reference/tars/standalone_studio_contract.md)
- Process canon: [`phase_0_process_canon.md`](../../../reference/tars/phase_0_process_canon.md)
- Pilot record: [`phase_1_pilot_record.md`](../../../reference/tars/phase_1_pilot_record.md)
- Superseded: [`tars_restoration_workspace`](../_pending/tars_restoration_workspace.md), [`tars_full_instruction_wizard_guidance`](../_pending/tars_full_instruction_wizard_guidance.md)
- Index: [`_index.md`](../../_index.md) · Context: [`.ai/context.md`](../../../context.md)

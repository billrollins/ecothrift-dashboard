<!-- initiative: slug=finalize-tars-app status=active updated=2026-08-12 -->
<!-- Last updated: 2026-08-12 (design signed off; stages 1-4 shipped; next is the bench) -->

# Initiative: Finalize TARS App

**Status:** **Active** — Design signed off. Stages 1–5 shipped and tagged. Nothing pushed to production yet.

**Objective:** One excellent, **100% functional MVP** of TARS that Mike and Ashley start using on the floor for real, pushed to production. Not a prototype, not a phase-gated research program — a finished small app.

**Supersedes:** [`tars_restoration_workspace`](./_archived/_pending/tars_restoration_workspace.md) (transactional queue/bench) and [`tars_full_instruction_wizard_guidance`](./_archived/_pending/tars_full_instruction_wizard_guidance.md) (process canon / guardrails). Both are closed to new work. Everything from 0 to 100 lives **here**. Their reference material stays valid: [`standalone_studio_contract.md`](../reference/TARS%20Restoration%20Processing%20App/standalone_studio_contract.md), [`phase_0_process_canon.md`](../reference/TARS%20Restoration%20Processing%20App/phase_0_process_canon.md), [`phase_1_pilot_record.md`](../reference/TARS%20Restoration%20Processing%20App/phase_1_pilot_record.md).

**Routes today:** `/restoration/tars` (standalone Studio), `/inventory/restorations` (Processing TO/FROM hub), `/restoration/parts-requests` (procurement).

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

**Register:** [`.ai/reference/TARS Restoration Processing App/audit_register.md`](../reference/TARS%20Restoration%20Processing%20App/audit_register.md)

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

**Design document:** [`design.md`](../reference/TARS%20Restoration%20Processing%20App/design.md) — **signed off 2026-08-12.**

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

**Design signed off 2026-08-12.** All six surface decisions are settled in [`design.md`](../reference/TARS%20Restoration%20Processing%20App/design.md); phases below are written from it.

Each phase is a digestible, independently testable block sized to finish in one sitting, running the same full cycle:

1. **Design detail** — the specific behavior for this block
2. **Plan** — file-level plan, Bill approves scope before code
3. **Code** — backend, then frontend
4. **Test** — Django tests + Vitest + `npm run build` green
5. **Walkthrough** — Bill verifies against the phase acceptance list
6. **Commit** — [`review.0.Bump.md`](../protocols/review.0.Bump.md) (semver + `CHANGELOG`)
7. **Push to prod** — [`code.9.Push.md`](../protocols/code.9.Push.md)
8. **Pull prod → local** — `scripts/deploy/0_pull_prod_to_local.bat`, so migrations never drift

A phase is not done until step 8. Phase ordering is Bill's call; the cycle does not change.

### Stages

Each is a git tag so Bill can keep some and drop others.

| | Stage | What changes | Tag |
|---|-------|--------------|-----|
| 0 | *(baseline before any code)* | — | `tars/0-original` |
| 1 | **Remove all legacy** | Delete everything unrouted, dead, and lying. No behavior change. | `tars/1-legacy-removed` **— shipped** |
| 2 | **One truth** | Server is the only authority on the catalog and the money. | `tars/2-one-truth` **— shipped** |
| 3 | **What it earned** | The clock learns the difference between looking and working; every finished job stamps what it added and what that came to per hour. | `tars/3-what-it-earned` |
| 4 | **The numbers up front** | TARS home is a scoreboard, not a menu. Everyone's dashboard gets items dispositioned per day. | `tars/4-numbers-up-front` |
| 5 | **The bench** | The grade table replaces the cockpit. Hover-expand, press-select, item-level looking clock, three bands. | `tars/5-the-bench` |
| 6 | **Bring back what was lost** | Scan-new to Bench; split, combine, pull-back to Handoff. | `tars/6-lost-found` |
| 7 | **Finish** | Editable grade scales, cancel a parts request, role guards, docs, full test pass. | `tars/7-finish` |

**Stages 1 and 2 were shipped ahead of design sign-off deliberately:** both are pure subtraction or bug fix, correct under any design, and independently revertible.

**Why 3 comes before the bench.** The bench's whole purpose is to make a rate visible, and a rate cannot be shown until the clock can tell looking from working and a finished job records what it added. Building the surface first would mean designing around numbers that do not exist yet. Stage 3 is also the only stage with a migration, so it lands alone and early.

No stage has been pushed to production yet. Steps 6–8 of the cycle (bump, push, pull prod) are outstanding.

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

**Grading moved out of the studio.** An item cannot go on a bench until its grades are priced, and only Ashley knows the prices — but the priced-grades step lived inside Mike's studio, where she had no reason to be. The queue is now its own component mounted in two places: `/restoration/queue` at her desk, and TARS Home so she can lean over and use Mike's screen. No role gate on either. This exposed a real gap: the existing patch endpoint only accepted `queued` jobs, so half the queue — anything already `sent` — could not be edited at all. `queue-details` replaces it and stays open until the item is finished.

**Two tabs, not four.** Home (scoreboard strip, queue, holding rail) and Bench. Queue and Holding are both lists of waiting items, so they sit side by side rather than each claiming a tab nobody visits.

| | |
|---|---|
| **Queue card** | Name, SKU, what Processing saw, retail, note, destination, days waiting, and value at stake — the spread between the best and worst grade. Sorted so items anyone can unblock come first, then the most money on the table, then age. |
| **Grade table** | Replaces the cockpit. One row per grade; Ashley's price is given, Mike answers odds, parts and minutes through press-to-open/release-to-select pickers. Rows sort by rate. Aiming the clock at a row *is* the decision — there is no separate commit step. |
| **Bands** | Each rate is read against the floor (what an hour costs) and the benchmark (what an hour usually returns), not one pass/fail line. |
| **Notices** | Every inline alert is gone. Standing conditions collect behind a header badge and open in a drawer. Recorded as a house rule in `.ai/extended/frontend.md`. |
| **Acceptance** | Nothing on any TARS surface shifts when state changes; Ashley can price grades without opening the studio; the bench fits on one screen. |

---

## Initiative acceptance

- [ ] Audit register complete, every element reviewed and given a verdict
- [ ] Design document written and signed off
- [ ] All coding phases from the design are shipped
- [ ] The full item lifecycle works on a routed surface, on the bench device
- [ ] No unrouted components, no mock or fallback data, no modeled-but-unreachable states
- [ ] `.ai/extended/` has an accurate TARS doc
- [ ] Shipped to production, Mike and Ashley are using it
- [ ] Bill signs off

---

## Sessions

Logged for documentation only. No owner input required.

**2026-08-12 — Design signed off; stages 3 and 4 shipped.** Settled the last six surface decisions with Bill on canvas and wrote them into `design.md`. Two of his answers changed the model rather than the surface: investigation time is clocked against the item instead of a grade, and rates are judged against a floor and a bar rather than one number. Wrote the Stage 3–7 phases from the design. Shipped `tars/3-what-it-earned` (timer attribution, `value_added` stamped at completion, scoreboard service — one migration) and `tars/4-numbers-up-front` (TARS home scoreboard; Restoration card on the shared dashboard now reports items finished this week instead of jobs in flight, which never matched the weekly goal beside it). 129 backend tests and 434 frontend tests green; build clean. Not pushed to production. Next: Stage 5, the grade table.

**2026-08-12 — Stage 5: queue and bench.** Bill reviewed the studio and rejected its shape rather than its numbers: the scoreboard had been bolted onto the Inbox lane, inline alerts pushed the work around whenever state changed, and the bench had grown past what anyone could read at once. Shipped `tars/5-queue-and-bench`. Two corrections were structural rather than cosmetic. First, grading moved out of the studio — an item cannot reach a bench until Ashley prices its grades, but that step lived on Mike's screen where she had no reason to be; the queue is now one component mounted both at `/restoration/queue` and on TARS Home, ungated. Finding this surfaced a real defect: the existing patch endpoint accepted only `queued` jobs, so anything already `sent` could not be edited at all, which is a large share of the queue. Second, tore out the cockpit, state bar, lane list, work-bench table and decision-session hook — about 1,950 lines — and replaced them with a grade table where aiming the clock at a row is itself the decision. Every inline `<Alert>` is gone; standing conditions now collect behind a badge and open in a drawer, and the no-layout-shift rule is written into `.ai/extended/frontend.md` so it does not have to be relearned. 128 restoration backend tests and 488 frontend tests green; build clean, TARS bundle down to 79 kB. The 82 failures in the wider inventory suite predate this work — `ManifestRow.description` was dropped in `5d2d7ef` and its tests were not updated. Not pushed to production.

**2026-08-11 — Audit compiled, design drafted, stages 1–2 shipped.** Consolidated both prior TARS initiatives into this one. Compiled the audit register from a full read of the TARS backend and frontend. Drafted [`design.md`](../reference/TARS%20Restoration%20Processing%20App/design.md) and a matching canvas. Shipped `tars/1-legacy-removed` (4,646 lines of unrouted code deleted) and `tars/2-one-truth` (server made the sole authority on decision economics, guarded by a contract test on each side; queue pressure and the grade-scale fallback removed). Not pushed to production. Open question for Bill: what device is at the bench.

---

## See also

- Audit register: [`audit_register.md`](../reference/TARS%20Restoration%20Processing%20App/audit_register.md)
- Studio contract: [`standalone_studio_contract.md`](../reference/TARS%20Restoration%20Processing%20App/standalone_studio_contract.md)
- Process canon: [`phase_0_process_canon.md`](../reference/TARS%20Restoration%20Processing%20App/phase_0_process_canon.md)
- Pilot record: [`phase_1_pilot_record.md`](../reference/TARS%20Restoration%20Processing%20App/phase_1_pilot_record.md)
- Superseded: [`tars_restoration_workspace`](./_archived/_pending/tars_restoration_workspace.md), [`tars_full_instruction_wizard_guidance`](./_archived/_pending/tars_full_instruction_wizard_guidance.md)
- Index: [`_index.md`](./_index.md) · Context: [`.ai/context.md`](../context.md)

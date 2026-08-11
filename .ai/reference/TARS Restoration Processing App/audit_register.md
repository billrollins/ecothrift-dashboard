

# TARS Audit Register

**Initiative:** [`finalize_tars_app`](../../initiatives/finalize_tars_app.md) — Stage 1 (Audit)

**Purpose:** One accurate list of everything TARS is, was, or was meant to be, with Bill's verdict on each element. This register is the input to Stage 2 (Design). It records **facts and verdicts only** — no solutions, no plans.

---

## How to use this

**AI has filled in:** the element, what it is, and its verified state in the code today.

**Bill fills in:** Verdict, MVP, Notes.


| Column      | Values                                                           |
| ----------- | ---------------------------------------------------------------- |
| **Verdict** | `Keep` (as-is) · `Change` · `Cut` · `?` (undecided)              |
| **MVP**     | `Must` · `Nice` · `No`                                           |
| **Notes**   | What is wrong, what it should do instead, who uses it, how often |




### Review method by section


| Section                  | State                                        | How Bill reviews it                                                             |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------- |
| **L — Live surfaces**    | Reachable in the app                         | **Open it and use it.** Firsthand experience is the point.                      |
| **B — Behavior & rules** | Live, but invisible logic behind the screens | AI explains the rule; Bill says whether it matches how the business should work |
| **U — Unreachable**      | Code exists, nothing routes to it            | AI describes what it did; Bill decides if the capability is still wanted        |
| **R — Removed**          | Deliberately deleted or replaced             | Read the record; Bill confirms it should stay gone                              |
| **N — Never built**      | Documented intent only                       | Bill decides if it still matters                                                |
| **D — Documents**        | Reference material                           | Bill confirms it is still valid                                                 |


---



## L — Live surfaces (review by using)



### L.1 — TARS Studio · `/restoration/tars`

Standalone full-screen app, opens in its own tab from the sidebar. Staff-only.


| #   | Element                 | What it is                                                                                                                                         | Verdict | MVP | Notes |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --- | ----- |
| L1  | Studio shell + header   | Back to dashboard, TARS title, Inbox/Bench/Pending chips with counts, scan field, HR clock chip, timer control                                     |         |     |       |
| L2  | Inbox lane              | Full-width list of jobs waiting (`queued` + `sent`); check in to move to bench                                                                     |         |     |       |
| L3  | Bench lane              | One technician-owned item at a time; the main work surface                                                                                         |         |     |       |
| L4  | Pending lane            | Held items with reason; resume back to bench                                                                                                       |         |     |       |
| L5  | Item State bar          | Always-visible: grade/value ladder, missing valuations in amber, current grade, known labor + parts cost, committed plan, "request missing values" |         |     |       |
| L6  | Cockpit — Grade tool    | Assess current grade / condition / completeness                                                                                                    |         |     |       |
| L7  | Cockpit — Tests tool    | Add a test, record pass/fail/unknown, note unknowns                                                                                                |         |     |       |
| L8  | Cockpit — Options tool  | Viable outcomes: grade + action + sale state per path                                                                                              |         |     |       |
| L9  | Cockpit — Decision tool | Ranked paths with economics, recommendation, your selection + reason                                                                               |         |     |       |
| L10 | Cockpit — Work tool     | Record performed work: verb, notes, result, labor minutes                                                                                          |         |     |       |
| L11 | Restoration log         | Chronological attributed history with filters; revise an entry, void one with a reason                                                             |         |     |       |
| L12 | Timer control           | Start/pause, live elapsed, auto-start on first meaningful action, 5-minute idle prompt ("were you still working?")                                 |         |     |       |
| L13 | HR clock coupling       | Timer only auto-starts when clocked in and not on break; clock-out and break pause it server-side                                                  |         |     |       |
| L14 | Parts drawer            | Build a parts list on the item, submit request, optional auto-hold to Pending                                                                      |         |     |       |
| L15 | Hold dialog             | Send to Pending with a reason (parts, time, test, tools, approval, research, safety, between steps, other)                                         |         |     |       |
| L16 | Finish dialog           | Final grade, destination (Processing / Storage / Salvage / Online Sales), spent hours, parts cost                                                  |         |     |       |
| L17 | Scan field behavior     | Scan a SKU: match on bench → select; in queue or pending → check in; **unknown SKU → "No matching item"**                                          |         |     |       |
| L18 | Move back to Inbox      | Return a bench item to the queue                                                                                                                   |         |     |       |
| L19 | Deep links              | `?view=inbox|bench|pending&job=<id>` — bookmarkable, used by Processing to jump you to an item                                                     |         |     |       |
| L20 | Timer switch dialog     | Prompt when switching items while a timer runs                                                                                                     |         |     |       |
| L21 | Bench ownership warning | Banner shown when legacy rows have unresolved ownership                                                                                            |         |     |       |




### L.2 — Processing Restorations hub · `/inventory/restorations`

Inside the dashboard. Ashley's side of the handoff.


| #   | Element                      | What it is                                                                                  | Verdict | MVP | Notes |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------- | ------- | --- | ----- |
| L22 | TO lane — valuation setup    | Jobs waiting on grade values; set grade scale + retail value per grade, plus handoff fields |         |     |       |
| L23 | TO lane — grade values card  | The scale picker + per-grade dollar table, with a suggested scale from history              |         |     |       |
| L24 | TO lane — processing handoff | Tested status, condition evidence, unknowns, optional quick tests                           |         |     |       |
| L25 | FROM lane — returns list     | Items coming back from TARS, worked or untouched                                            |         |     |       |
| L26 | FROM lane — decision panel   | Review the return: set price, print labels, mark handled                                    |         |     |       |
| L27 | Legacy redirect              | `/inventory/restoration-returns` → `?lane=from`                                             |         |     |       |




### L.3 — Other live surfaces


| #   | Element                                                | What it is                                                                                                                                                                     | Verdict | MVP | Notes |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --- | ----- |
| L28 | Parts procurement page · `/restoration/parts-requests` | Bill's page: see submitted requests, record an order (PO, supplier, costs, shipping), mark received. **Nav restricts to Manager/Admin but the route itself allows any staff.** |         |     |       |
| L29 | Send to Restoration dialog                             | In Processing: dispatch an item to restoration with grade scale + values. Rejects quantity > 1.                                                                                |         |     |       |
| L30 | Dashboard restoration tile                             | Active jobs, awaiting parts, returns pending, jobs done this week/today, and verb counts                                                                                       |         |     |       |
| L31 | Sidebar entry                                          | "TARS" under Restoration; opens in a new tab                                                                                                                                   |         |     |       |


---



## B — Behavior and rules (review by explanation)

Invisible logic. Bill judges whether each rule matches how the business should actually work.


| #   | Element                  | The rule as implemented                                                                                                                                                                                   | Verdict | MVP | Notes |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --- | ----- |
| B1  | Job lifecycle            | `queued → sent → bench ⇄ pending → done`; side path to `returned`; scanning a finished item requeues it                                                                                                   |         |     |       |
| B2  | One job per check-in     | A job is created per Processing check-in; quantity > 1 is rejected at dispatch, multi-item stacks must be split to reach the bench                                                                        |         |     |       |
| B3  | Grade scales             | Four seeded: Functional (Working/Repairable/Parts-only), Completeness, Assembly, Condition (New→Salvage). Custom scales can be created but **not edited or deactivated**                                  |         |     |       |
| B4  | Grade values             | Retail dollars per grade, set by Processing. Incomplete values do **not** block check-in, but **do** block completion                                                                                     |         |     |       |
| B5  | Valuation request        | TARS can ask Processing for missing grade values; fulfilled automatically when the values are filled in                                                                                                   |         |     |       |
| B6  | Processing handoff       | Versioned record: tested status, condition evidence, unknowns, quick tests. Acknowledging it is **not** required to finish                                                                                |         |     |       |
| B7  | Mandatory stop-outs      | Three: legally prohibited sale, handling stop, truthful disclosure. A blocked stop-out blocks matching paths regardless of profit                                                                         |         |     |       |
| B8  | Universal test catalog   | Seven built-in tests, deliberately not category-specific                                                                                                                                                  |         |     |       |
| B9  | Economics                | `contribution = value − parts − labor`, ranked by **contribution per labor minute**. Effective labor rate **$19.80/hr**. Minimum handling minutes floor short paths (untested/as-is 5 min, salvage 3 min) |         |     |       |
| B10 | Queue pressure           | Captured in the record but **hardcoded to not affect scoring**                                                                                                                                            |         |     |       |
| B11 | Completion gates         | Eleven required fields; ordinary gaps can be overridden with an identified reason; a mandatory stop-out cannot be overridden; final grade must match the selection                                        |         |     |       |
| B12 | Timer rules              | Auto-start on first state-changing action (not on merely opening a tool); 5 minutes idle pauses and asks; "no" restores the last meaningful-action baseline; ending a break does not auto-resume          |         |     |       |
| B13 | Bench ownership          | Database constraint: at most one `bench` job per technician; conflict returns 409 with the existing item                                                                                                  |         |     |       |
| B14 | Restoration log model    | Append-oriented; corrections create a superseding entry; deletes are voids with a reason; system events cannot be edited                                                                                  |         |     |       |
| B15 | Parts lifecycle          | `draft → submitted → ordered → received`; receiving flags the pending job; ordered line totals default the completion parts cost                                                                          |         |     |       |
| B16 | Dispositions             | Processing → `processing`, Storage → `back_storage`, Salvage → `salvage`, Online Sales → `online_sales`; only the Processing route writes a return snapshot for retag                                     |         |     |       |
| B17 | Return to Processing     | Two kinds: TARS-completed (with achieved grade) or untouched (recalled / not worth it / other); can return part of a stack                                                                                |         |     |       |
| B18 | Split / combine          | Stacks can be split into individuals or combined when same PO + product                                                                                                                                   |         |     |       |
| B19 | Permissions              | Every restoration endpoint is `Employee / Manager / Admin`. No TARS-tech vs Processing vs Manager distinction                                                                                             |         |     |       |
| B20 | Decision engine location | Server computes and **overwrites** client economics on save; the Studio also computes its own copy to display                                                                                             |         |     |       |
| B21 | Dashboard verb counts    | Counted from `work_session.actions[]`, a schema the app **no longer writes**                                                                                                                              |         |     |       |


---



## U — Unreachable (code exists, nothing routes to it)

Roughly 2,500 lines of frontend plus several backend paths. Bill decides whether the capability is still wanted, not whether the code is kept.


| #   | Element                             | What it did                                                                                                                                       | Verdict | MVP | Notes |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --- | ----- |
| U1  | Queue management page               | The whole old queue UI: search, stacks, grade editing, combine, split, return, create from SKU (1,654 lines)                                      |         |     |       |
| U2  | Create job from unknown SKU         | Scan something not in the system and start a restoration job for it                                                                               |         |     |       |
| U3  | Split a stack                       | Break a multi-item job into individuals from the queue                                                                                            |         |     |       |
| U4  | Combine stacks                      | Merge queued jobs with the same PO + product                                                                                                      |         |     |       |
| U5  | Return to Processing from the queue | Send an item back before it ever reaches the bench                                                                                                |         |     |       |
| U6  | Old bench rail                      | Sidebar with lanes and item cards, pre-Studio                                                                                                     |         |     |       |
| U7  | Old decision workbench              | The decision UI before the cockpit                                                                                                                |         |     |       |
| U8  | Full-screen bench timer             | Large touch-friendly timer overlay                                                                                                                |         |     |       |
| U9  | Grade eval dialog                   | Grade + parts evaluation in a modal                                                                                                               |         |     |       |
| U10 | Queue-side dialogs                  | "Already in queue", "Item blocked elsewhere", "Needs prices"                                                                                      |         |     |       |
| U11 | `send` endpoint                     | Moves a job `queued → sent`. API and client function both exist; **nothing calls either**                                                         |         |     |       |
| U12 | Cancel a parts request              | Status is modeled and the order path refuses cancelled requests, but nothing can set it                                                           |         |     |       |
| U13 | Decision catalog endpoint           | Server can serve the test list, stop-outs, labor rate, and handling minutes; **not exposed**, so the frontend keeps its own hand-copied duplicate |         |     |       |
| U14 | Processing desk query               | A server-side TO-desk query that is defined but never used; the hub filters client-side instead                                                   |         |     |       |
| U15 | Client grade-scale fallback         | Hardcoded scales render when the API returns nothing, so a broken API looks like working data                                                     |         |     |       |


---



## R — Removed (confirm it stays gone)


| #   | Element                   | Why it went                                                                                                                               | Verdict | MVP | Notes |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | --- | ----- |
| R1  | Verb tabs                 | Separate Test / Assemble / Repair / Salvage queues from the original prototype; replaced by one unified bench with attributed work events |         |     |       |
| R2  | `/restoration/queue` page | Replaced by the Studio; the URL now redirects                                                                                             |         |     |       |
| R3  | `executing` stage         | Dead lifecycle stage, dropped                                                                                                             |         |     |       |
| R4  | Guided decision wizard    | The pre-Studio wizard Bill graded D/F; replaced by the standalone Studio                                                                  |         |     |       |
| R5  | Restoration Returns page  | Standalone page folded into the Restorations hub FROM lane                                                                                |         |     |       |
| R6  | `work_session.actions[]`  | Old work-record shape, replaced by bench rows and the decision record. **The dashboard still reads it**                                   |         |     |       |


---



## N — Never built (documented intent)

From the two superseded initiatives and the pilot record. Bill decides whether each still matters.


| #   | Element                               | Where it came from                                                                             | Verdict | MVP | Notes |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ------- | --- | ----- |
| N1  | Per-verb detail panels                | Old workspace Phase 3: parts used, actual hours, notes, photos per verb                        |         |     |       |
| N2  | Photos at the bench                   | Repeatedly mentioned, never built                                                              |         |     |       |
| N3  | Owner time-premium steering           | Old workspace Phase 4: base rate + backlog-aware premium from settings                         |         |     |       |
| N4  | Category-specific test catalogs       | Guidance Phase 2; deliberately deferred as universal-only                                      |         |     |       |
| N5  | Bill-managed catalog editing          | Guidance Phase 2: create/edit/activate/version/roll back rules and templates                   |         |     |       |
| N6  | Decision & override review view       | A page for Bill to inspect what was decided and why                                            |         |     |       |
| N7  | Calibrated backlog adjustment         | Adjust scoring by workload once enough real decisions exist                                    |         |     |       |
| N8  | Applied-version history across rework | Today a requeue resets the work session                                                        |         |     |       |
| N9  | Improvement feedback loop             | Guidance Phase 3: staff flag a gap, it gets triaged, decided, and closed back to them          |         |     |       |
| N10 | Bench device layout                   | Touch-first layout; the Studio only goes side-by-side at very wide screens                     |         |     |       |
| N11 | TARS extended doc                     | No `.ai/extended/` entry exists for an app this size                                           |         |     |       |
| N12 | Auction won → Purchase Order link     | Adjacent gap: no DB link between a won auction and a PO, so restoration cost tracing is manual |         |     |       |


---



## D — Documents (confirm still valid)


| #   | Document                                                           | What it claims                                                                                  | Verdict | MVP | Notes |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------- | --- | ----- |
| D1  | [`standalone_studio_contract.md`](./standalone_studio_contract.md) | The Studio's product surface, ownership rules, log model, timer rules, and a 10-step smoke path |         |     |       |
| D2  | [`phase_0_process_canon.md`](./phase_0_process_canon.md)           | The approved cross-role TARS process and vocabulary                                             |         |     |       |
| D3  | [`phase_1_pilot_record.md`](./phase_1_pilot_record.md)             | What was tested and accepted at Phase 1, plus the observation plan that never ran               |         |     |       |
| D4  | [`TARS.dc.html`](./TARS.dc.html)                                   | The original prototype; source of intent, not a contract                                        |         |     |       |


---



## Findings log

Defects, surprises, and questions raised during the walkthrough. **Observations only — no solutions.** These feed Stage 2.


| #   | Finding | Raised during | Severity |
| --- | ------- | ------------- | -------- |
| F1  | The bench could show a labor rate the server would never save. The browser derived `$18 × 1.1` while the server hardcoded `$19.80`; they agreed only by coincidence of construction, so editing either constant alone would have silently diverged the previewed money from the saved money. | Code audit | **High** — fixed in `tars/2-one-truth` |
| F2  | Queue pressure was asked, validated, stored, and then explicitly forced to not affect scoring. The app collected an answer it had already decided to ignore. | Code audit | Low — removed in `tars/2-one-truth` |
| F3  | A failed grade-scales request rendered four hardcoded scales instead of an error, so a broken API looked like a working one. | Code audit | Medium — removed in `tars/2-one-truth` |
| F4  | Roughly 2,500 lines of TARS frontend had no route to them, including a second complete implementation of the bench. Reading the tree meant guessing which version was live. | Code audit | Medium — deleted in `tars/1-legacy-removed` |
| F5  | Split, combine, pull-back-before-bench, and scan-an-unknown-SKU existed only inside that unrouted code. The capabilities were lost silently when the Studio replaced the queue page. | Code audit | **High** — no home yet; Stage 4 of the design |
| F6  | Nobody has confirmed what device is physically at the bench. Every layout decision depends on it. | Design | **Blocking** — one question for Bill |


---

*Parent:* [`finalize_tars_app`](../../initiatives/finalize_tars_app.md) · *Design:* [`design.md`](./design.md)
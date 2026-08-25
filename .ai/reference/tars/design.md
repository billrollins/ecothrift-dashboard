<!-- Last updated: 2026-08-24 (purchase desk on the bench) -->

# TARS — The Design

**Know what it's worth. Decide what to do. Prove what you did.**

---

## Why it feels fragmented

TARS has been built three times. **Nothing was ever fully removed.**

| | Attempt | What it left behind |
|---|---------|---------------------|
| **1** | **Prototype** — separate Test / Assemble / Repair / Salvage queues, profit engine, owner steering | Verb thinking, a profit model, ideas never built |
| **2** | **Guided wizard** — a decision worksheet in the dashboard. You graded it **D/F** | The UI died. Its **skeleton lived**: an 11-field decision record, a test catalog, and a money engine — plus a **second copy of that engine in the browser** |
| **3** | **Studio** — standalone tab, one item, live log, timer. Good bones | Inherited the wizard's skeleton as 5 tool tabs. **Silently dropped the old queue page** and everything it could do |

**The pattern: every attempt added a layer, none subtracted one.**

So today:

```
  2,500 lines          nothing routes to them
  2 money engines      server saves one number, screen shows another
  2 test catalogs      one hand-copied into the browser
  3 lost functions     split, combine, scan-a-new-item — alive only in dead code
  1 lying dashboard    reads a data shape the app stopped writing months ago
  4 dead ends          cancel a parts order, edit a grade scale — modeled, unreachable
  1 pointless question we ask how busy the queue is, then ignore the answer
```

**The fix is not a fourth attempt.** It is subtraction, then finishing the third one.

---

## The app

Three surfaces. One per person. Nothing else.

```
   ASHLEY                    MIKE                      BILL
   ───────                   ────                      ────
   HANDOFF        ──────▶    BENCH          ──────▶    DESK
   Processing                Standalone tab            Dashboard

   send it over              do the work               order the parts
   take it back              log the work              see what was decided
   split the stack           say where it goes         and why
```

Today there is a fourth thing floating (a parts-requests page) and no "why" view at all. Fold them into the Desk.

---

## The Bench

**Five tool tabs today.** Grade · Tests · Options · Decision · Work. That is the wizard's skeleton wearing the Studio's skin.

There are no steps in the new one. **Investigation is itself the work** — taking something apart to find out what's wrong *is* the repair starting — so any fixed order is a lie. Instead there is a table of grades, and the job is whatever raises the expected value of Mike's next hour.

**Two people write to one table.**

| Ashley owns | Mike owns |
|---|---|
| The **grade system** — reused or created. *Assembled / Unassembled*. *Working / Partly working / As-is parts*. Whatever fits. | **Which grade it is now** — claimed for finish, not for WORTH |
| The **price at each grade**, taken as what it sells at | **Parts cost** to get there |
| | **Time to work** — `5 · 10 · 15 · 20 · 30 · 45 · 60 · 90 · 120` |

Every answer is a chip, not a field. Free-form is available and never required. Nothing takes more than five seconds.

**Time to look is deliberately not in that list.** It belongs to the item, not to a grade — see below.

**What the app computes:**

```
( sells for this grade − Parts-section lines − min sells-for on the scale ) ÷ hours of work left

Hours are minutes / 60. `parts` in that subtraction is **Parts-section lines only**. Supplies and FFE stay visible so a pricey fixture can still kill the repair by eye; they never enter WORTH or value-added. Shipping, tax, and fees stay on the purchase total. The lowest priced grade on the scale is the floor, not the grade the item stands at.
```

**The bench is the app.** Header money is dollars. Time-worth stays on the WORTH column. There is no “the item” baseline row. Actions are on the item, not on a grade. Original and Current are claimed in the header; first claim fills both.

```
CONSOLE  41880  Pressure washer · Generic · Outdoor  Retail $180
         Original ▾ Won't start  →  Current ▾ Won't start    +$0 added   $110 left
         Command: Hold · Back to Queue · Finish    Notices ▾ (top drawer)

LEFT     GRADE                 SELLS FOR  PARTS  MINS   WORTH
         ★Working, complete        $180    $25    45m   $180/hr
          Working, missing wand    $120    $25    40m   $113/hr
          Won't start               $45     —      —    —
          Parts only                $20     —      —    —

         PARTS 3 · $42         ORDERS 1            (on the bench; each pane scrolls)

RIGHT    Current action  Inspect · carb clean
         Started 14:11  Mike  4m  Inspect
         Actions | Inspect · Test · Assemble · Repair · Salvage   Clear filters
         Notes · Grades · Estimates · Parts · Progress            Clear history
         14:18  Mike  Estimates  Won't start estimate · parts $40 → $25
         14:11  Mike  Inspect    carb clean
         14:06  Mike  Progress   Original set to Won't start
```

Starting the clock from a row is the whole time-attribution mechanism: every second points at either the item (looking) or a grade (working). Estimated-versus-actual falls out for free, and so does the log — each entry is an action plus what it changed, which answers *what* and *why* with nothing typed.

### Looking belongs to the item (answered 2026-08-12)

One teardown informs every grade at once. Pulling the carburettor raises *Working, complete*, kills *Parts only*, and moves *Missing wand* — so charging those minutes to a single row would be a fiction, and choosing which row to charge is a decision with no correct answer. Exactly the busy work that must not exist.

So investigation is **clocked against the item and never estimated**. Rows keep two chips — parts and minutes — and a row's rate answers a cleaner question: *if I commit to this grade, what does my labour return?*

That leaves one genuinely separate question — **keep looking, or commit?** It is an item question about the value of information, and it needs no new input, because the answer is already visible. More looking pays only when knowing more would change the move:

| Signal | Reading |
|--------|---------|
| Grades still disagree by a lot | `$20–$180` open. The answer matters, so looking is worth it. |
| The best move has no minutes yet | No rate. Minutes that produce one are well spent. |
| Neither holds | Rates clustered, minutes filled. Stop looking, press work. |

Hence the item line: *still open: $20–$180, best move $180/hr*. A statement of what is unresolved, not a score to interpret.

> **The one thing this must not break.** Forward decisions exclude look time, because it is spent and sunk cost never counts. But the record of what the item *earned* has to include it, or restoration will look more profitable than it is. **Decision rate excludes looking; reported rate includes it.**

### What the rate is judged against (answered 2026-08-12)

Two numbers, doing two different jobs — which is what produces three bands rather than a pass/fail line.

- **$20/hr — the pay-rate unit.** The floor. It is the marginal cost of the hour Mike is about to spend.
- **~$25/hr — the universal long-term average**, measured on **item start-to-stop** so it reflects productive time rather than payroll time. The bar to beat.

| Band | Verdict |
|------|---------|
| Under $20 | **Don't.** The hour costs more than the work makes. Sell at the grade it already is. |
| $20 – $25 | **Only if nothing better waits.** Profitable but below a normal hour, so anything better in the queue comes first. This band is the entire reason to show the average. |
| Over $25 | **Do it now.** Beats a normal hour; no further deliberation is useful. |

The other rates you listed stay off the bench, deliberately:

| Number | Why not on Mike's screen |
|--------|--------------------------|
| Mike's $15/hr wage | Pricing off one person's wage makes the same item worth restoring or not depending on who picks it up. |
| Mike's personal average | Useful for coaching, corrosive as a live target, and it moves the bar with whoever is standing at the bench. |
| Your ideal average | An aspiration is not a threshold. On the bench, everything under it reads as failure even when it beat every alternative. |

Two guardrails so the average stays fair: it must be a **trailing window** rather than all history, and it must have a **minimum sample** before it is shown at all — early on, one lucky item sets an unreachable target. Until then, show only the $20 floor.

> **A mismatch worth naming.** $20 buys an hour of *payroll*; the $25 average is earned per hour actually *on an item*. At 70% utilisation an on-item hour truly costs about $28, so a $22/hr item clears the displayed floor while losing money on the day. For Mike's next-move decision the $20 comparison is still right — the overhead exists whichever item he picks. But *is restoration paying as a department* needs the utilisation-adjusted figure. **Same data, different question: that number belongs on Bill's dashboard, not in Mike's rows.**

### Revisions (answered 2026-08-12)

Changing an estimate is just pressing the field again. No confirmation, no reason required, no sense of amending a record. The log captures the change silently — old value, new value, and the minutes of looking that sat in between:

```
14:18 · looked 4 min · Missing wand parts $40 → $25
```

The why is *structural*: he looked, then the remaining work changed. This is what makes the perfect log free — the estimate change **is** the finding, so nothing has to be written for the record to be complete.

### How a number gets in (answered 2026-08-12)

One gesture per estimate. Nothing in the bench costs two clicks.

| | |
|---|---|
| **Hover a row** | It expands in place and shows its parts and minutes. No click to get in, no click to get out. Only one row is open at a time — whichever he is pointing at. |
| **Press a field** | Options fan out on mouse-*down*, under the cursor. Nothing waits for a second click. |
| **Release on an option** | That value is taken. |
| **Release anywhere else** | Nothing changes. Cancelling needs no target and no thought. |
| **Press a row's *work on this*** | The clock moves to that grade. Press **looking** in the item band and it moves to the item. Time is allocated by pointing at what you are about to do. |

A permanent strip at the top says what is running, and because looking is item-level it has only two things to say: *Looking at the item*, or *Working — [grade]*.

### Unset is a state (answered 2026-08-12)

There is no `?` value. *Unset* and *zero* are different facts and the screen has to say which it is holding.

| State | Looks like | Rate column |
|-------|-----------|-------------|
| Untouched | Muted parts chip at `$0`; minutes placeholder | `—` until minutes are set |
| Parts set, minutes not | Parts solid; minutes muted | `—` |
| Fully estimated | Both solid | `$180/hr` |

A rate cannot exist before minutes are set — dividing by zero hours would report an infinite return. Unset parts defaults to zero, which is optimistic: a row can show a rate as soon as minutes land, and that rate is provisional until the parts list (or picker) is real.

---

## The rules that matter

| | |
|---|---|
| **Only what's left counts** | Sunk cost never enters the maths. Fifty minutes deep and ten minutes from a $135 gain, the number must shout *finish it*. The past enters one way only: a failed attempt is evidence, so it changes the remaining parts and minutes on the grades still on the table. |
| **Every second is attributed** | The clock always points at either the item (looking) or a grade (working). Started by pointing at the thing, so there is never a "what are you doing" question to answer. |
| **One number** | The server computes the money. The screen shows what the server computed. Never two answers. |
| **Say it in English** | Not "contribution per labor minute." **"$51/hr."** |
| **Safety beats profit** | A legal, handling, or disclosure stop cannot be overridden by a good number. Everything else can, with a reason. |
| **Ask only what changes the answer** | Today: 11 required fields to finish. In the new one, two estimates per candidate grade — parts and minutes, one gesture each — and no free text unless Mike wants it. |
| **The clock follows the work** | Starts on your first real action, not when you open a tab. Pauses when you clock out or go on break. Five quiet minutes and it asks whether you're still there. |
| **One item at a time** | One bench item per person, enforced by the database. The bench is a bench. |
| **Nothing is erased** | Corrections supersede. Deletions are voids with a reason. The story stays readable. |

---

## Three lost functions come home

They exist only in dead code today. Return them to whoever owns the problem.

| Function | Goes to | Because |
|----------|---------|---------|
| Scan something unknown → start a job | **Bench** | Mike found it on a cart |
| Split or combine a stack | **Handoff** | Ashley made the stack |
| Pull it back before the bench | **Handoff** | It's still hers |

There is no "queue page" in the new design. The queue is Mike's Inbox and Ashley's TO lane. That's what a queue page was.

---

## Cut · Fix · Later

| **CUT** | **FIX** | **NOT MVP** |
|---------|---------|-------------|
| 2,500 unrouted lines | Grade scales you can edit | Photos at the bench |
| The browser's money engine | Cancel a parts order | Category-specific tests |
| The hand-copied test catalog | Parts page locked to managers | Time-premium steering |
| Fake grade scales that hide a broken API | A dashboard that counts real work | Backlog-pressure scoring |
| The queue-pressure question | Touch layout for the bench | Override analytics |
| The unused `send` stage | 11 required fields → 7 | Feedback-loop tooling |

---

## The room (answered 2026-08-12)

Four desktops across two rooms. **#1 and #2** are shared in **PR 1** by Ashley and the other processors. In **PR 2**, Ashley (**#3**) and Mike (**#4**) each have their own, both sitting on **Table 1** — the 4′×8′ surface items are passed across in both directions. **Mike's own 4′×8′ work table is one foot away.** Phones are available as needed.

```
  PR 1                          PR 2
  ┌─────────────────┐   ┌──────────────────────────────────────┐
  │  #1        #2   │   │  TABLE 1 — 4'x8' queue / transfer    │
  │  shared:        │   │  [ #3 Ashley ]      [ #4 Mike ]      │
  │  Ashley + other │   └──────────────────────────────────────┘
  │  processors     │                  ↕ 1 foot
  └─────────────────┘   ┌──────────────────────────────────────┐
                        │  MIKE'S WORK TABLE — 4'x8'           │
                        │  the repair happens here, #4 in view │
                        └──────────────────────────────────────┘
```

**Settled**

- Desktop-first, mouse and keyboard. No thumb-sized controls, no second mobile build. Density is affordable.
- **Mike's screen is his own and a foot from the work.** He is at the app continuously, so live numbers are worth showing — he will see them move.
- Nobody shares a restoration session, so "one bench item per person" needs no identity juggling. The machine is the person.
- Scanning happens at a fixed station, so the scan field can hold focus.
- Photos come from a phone shared to the desktop over Windows Link or USB. Photo capture is a desktop feature and lands on the record directly.

**Opened**

| | Because |
|---|---|
| **Ashley works across both rooms** | Shared machines in PR 1, her own in PR 2. Handoff must be equally usable in both, and she may start a send in one room and finish it in the other. |
| **#3 and #4 share Table 1** | A handoff can be face to face and simultaneous — but it still has to work perfectly when she is not standing there. |

---

## Build order

Each stage is a git bookmark. Keep the ones you like.

| | Stage | What changes | Risk |
|---|-------|--------------|------|
| **1** | **Remove all legacy** | Delete everything unrouted, dead, and lying. No behavior change. | None — pure subtraction |
| **2** | **One truth** | Server serves the catalog and the money. Browser stops guessing. | Low — numbers get *more* correct |
| **3** | **The bench** | Five tools become three moves. Touch-first. | The visible one |
| **4** | **Bring back what was lost** | Scan-new, split, combine, pull-back | Low — proven code, new home |
| **5** | **Bill's desk** | Parts + decisions in one place. Honest dashboard. | Low |
| **6** | **Finish** | Editable scales, cancel parts, guards, docs, full test pass | Low |

---

*Parent: [`finalize_tars_app`](../../initiatives/_archived/_completed/finalize_tars_app.md) · Audit: [`audit_register.md`](./audit_register.md)*

<!-- Last updated: 2026-08-12 (room answered; bench rebuilt on Bill's grade/expected-value model; all six surface decisions settled — interaction, unset state, benchmarks, item-level investigation, revisions, clock) -->

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
| The **grade system** — reused or created. *Assembled / Unassembled*. *Working / Partly working / As-is parts*. Whatever fits. | **Which grade it is now** — the datum |
| The **price at each grade**, taken as what it sells at | **Probability** of reaching each other grade — `0 · 25 · 50 · 75 · 100` |
| | **Parts cost** to get there |
| | **Time to work** — `5 · 10 · 15 · 20 · 30 · 45 · 60 · 90 · 120` |

Every answer is a chip, not a field. Free-form is available and never required. Nothing takes more than five seconds.

**Time to look is deliberately not in that list.** It belongs to the item, not to a grade — see below.

**What the app computes:**

```
(( price at target − price now ) × probability − parts) ÷ hours of work left
```

**The grade table is the app.**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ← On deck (7)  41880  Pressure washer   Shelf        ● Looking at the item 4:12 ⏸│
├─────────────────────────────────────────────────────────────────────────────────┤
│ [looking]  11 min spent looking      still open: $45–$180, best move 50% sure    │
├─────────────────────────────────────────────────────────────────────────────────┤
│  GRADE                  SELLS  PROB  PARTS  WORK    PER HOUR                    │
│ ★Working, complete       $180   50%   $25    45m     $57/hr   work on this       │
│  Working, missing wand   $120   75%   $25    40m     $47/hr   work on this       │
│ ●Won't start  NOW         $45    —     —      —     sell now  send back          │
│  Parts only               $20    —     —      —     below current                │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Best move $57/hr   ·  an hour costs $20  ·  usually earns $25     [do it now]    │
│ ──────────────┼───┼──────────────────────────────────────────▼                  │
│  under $20    $20–25          over $25                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ WHAT HAPPENED   14:06 current grade set → $45 datum                             │
│                 14:07 estimated Working complete → 50% · $25 · 45m               │
│                 14:11 looked at the item, 7 min → carb clean, 50% held           │
│                 14:18 looked at the item, 4 min → Missing wand 60% → 75%         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Starting the clock from a row is the whole time-attribution mechanism: every second points at either the item (looking) or a grade (working). Estimated-versus-actual falls out for free, and so does the log — each entry is an action plus what it changed, which answers *what* and *why* with nothing typed.

### Looking belongs to the item (answered 2026-08-12)

One teardown informs every grade at once. Pulling the carburettor raises *Working, complete*, kills *Parts only*, and moves *Missing wand* — so charging those minutes to a single row would be a fiction, and choosing which row to charge is a decision with no correct answer. Exactly the busy work that must not exist.

So investigation is **clocked against the item and never estimated**. Rows keep three chips, and a row's rate answers a cleaner question: *if I commit to this grade, what does my labour return?*

That leaves one genuinely separate question — **keep looking, or commit?** It is an item question about the value of information, and it needs no new input, because the answer is already visible. More looking pays only when knowing more would change the move:

| Signal | Reading |
|--------|---------|
| Grades still disagree by a lot | `$45–$180` open. The answer matters, so looking is worth it. |
| The best move is not yet confident | 50% is a coin flip. Minutes that make it 90% or 10% are well spent. |
| Neither holds | Grades clustered, or the leader near-certain. Stop looking, press work. |

Hence the item line: *still open: $45–$180, best move only 50% sure*. A statement of what is unresolved, not a score to interpret.

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
14:18 · looked 4 min · Missing wand 60% → 75%
```

The why is *structural*: he looked, then his belief moved. This is what makes the perfect log free — the estimate change **is** the finding, so nothing has to be written for the record to be complete.

### How a number gets in (answered 2026-08-12)

One gesture per estimate. Nothing in the bench costs two clicks.

| | |
|---|---|
| **Hover a row** | It expands in place and shows its three estimates. No click to get in, no click to get out. Only one row is open at a time — whichever he is pointing at. |
| **Press a field** | Options fan out on mouse-*down*, under the cursor. Nothing waits for a second click. |
| **Release on an option** | That value is taken. |
| **Release anywhere else** | Nothing changes. Cancelling needs no target and no thought. |
| **Press a row's *work on this*** | The clock moves to that grade. Press **looking** in the item band and it moves to the item. Time is allocated by pointing at what you are about to do. |

A permanent strip at the top says what is running, and because looking is item-level it has only two things to say: *Looking at the item*, or *Working — [grade]*.

### Unset is a state (answered 2026-08-12)

There is no `?` value, because a question mark cannot be multiplied. But *unset* and *zero* are different facts and the screen has to say which it is holding.

| State | Looks like | Rate column |
|-------|-----------|-------------|
| Untouched | Muted chip showing the default it computes with — `0`, not blank | Badge: `3 to go` |
| Probability set, work time not | Set chips solid, the rest muted at their defaults | Badge: `2 to go` |
| Fully estimated | All solid | `$57/hr` |
| Probability set to zero | Solid `0`, badge cleared | *not happening* |

Two consequences worth stating. A rate cannot exist before the numbers behind it, so the badge occupies that column until it can — no zero pretending to be an answer. And an explicit zero probability ends the questions for that grade: parts and minutes for an unreachable grade are wasted keystrokes, so saying no is a complete answer.

One asymmetry remains by choice: unset probability defaults to zero, which is cautious, but unset parts defaults to zero too, which is optimistic. So a row keeps its badge even after a rate appears, marking the rate as provisional.

---

## The rules that matter

| | |
|---|---|
| **Only what's left counts** | Sunk cost never enters the maths. Fifty minutes deep and ten minutes from a $135 gain, the number must shout *finish it*. The past enters one way only: a failed attempt is evidence, so it moves the probability of the grades still on the table. |
| **Every second is attributed** | The clock always points at either the item (looking) or a grade (working). Started by pointing at the thing, so there is never a "what are you doing" question to answer. |
| **One number** | The server computes the money. The screen shows what the server computed. Never two answers. |
| **Say it in English** | Not "contribution per labor minute." **"$51/hr."** |
| **Safety beats profit** | A legal, handling, or disclosure stop cannot be overridden by a good number. Everything else can, with a reason. |
| **Ask only what changes the answer** | Today: 11 required fields to finish. In the new one, three estimates per candidate grade — one gesture each — and no free text unless Mike wants it. |
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

*Parent: [`finalize_tars_app`](../../initiatives/finalize_tars_app.md) · Audit: [`audit_register.md`](./audit_register.md)*

<!-- Last updated: 2026-08-11 -->

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

**Five tool tabs today.** Grade · Tests · Options · Decision · Work. That is the wizard's skeleton wearing the Studio's skin. Nobody thinks in five tools.

**Three moves.**

```
┌────────────────────────────────────────────────────────────┐
│  SKU 40122   Vacuum, upright        Working $89  Repair $40 │  ← always visible
│  now: Repairable    spent: 22 min + $14 parts               │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   ① ASSESS ────────▶ ② DECIDE ────────▶ ③ DO      ▸ FINISH  │
│                                                             │
│   What is it        Repair    $34/hr ★   [Repair]  22:14 ⏸  │
│   right now?        Sell as-is  $22/hr                      │
│                     Parts out   $11/hr   + log work         │
│   ◉ Repairable      Test first  blocked  + need parts       │
│   ✓ powers on         └ safety hold                         │
│   ✗ no suction                                              │
│                                                             │
├────────────────────────────────────────────────────────────┤
│  LOG   14:02 checked in · 14:05 powers on · 14:11 chose…    │
└────────────────────────────────────────────────────────────┘
```

**① ASSESS** — What is it right now? Pick the grade. Note what you checked.
A test is *evidence for a grade*, not a separate ceremony. Tests fold into Assess.

**② DECIDE** — What's the play? Every option in **dollars per hour of your time**.
Blocked options say why and cannot be argued with. Pick one; if it isn't the top one, say why.

**③ DO** — Work. The timer runs itself. Log as you go. Need parts, request and hold.

**▸ FINISH** — Final grade, where it goes. Done.

**Always on screen:** the item, its value ladder, what it has cost so far.
**Always beside:** the log — every step, who, when, correctable, never erased.

---

## The rules that matter

| | |
|---|---|
| **One number** | The server computes the money. The screen shows what the server computed. Never two answers. |
| **Say it in English** | Not "contribution per labor minute." **"$34/hr."** |
| **Safety beats profit** | A legal, handling, or disclosure stop cannot be overridden by a good number. Everything else can, with a reason. |
| **Ask only what changes the answer** | Today: 11 required fields to finish. Enough: grade, what you checked, the call, why, what you did, final grade, destination. |
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

## The one thing I need from you

**What is physically at the bench — a tablet, a phone, or a desktop?**

I am designing touch-first from tablet up and making a phone survivable. If it's a desktop only, Stage 3 gets much smaller. Everything else in this document I am confident about without asking.

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

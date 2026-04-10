<!-- Last updated: 2026-04-10T12:00:00-05:00 -->
# Protocol: Get bearing

A **mid-session** orientation check. Run when you have been heads-down and need an honest picture of where things stand. This is **not** the rolling doc/changelog pulse (that is **`session_checkpoint.md`**). This is **not** the pre-commit gate (that is **`session_close.md`**). This is a **compass** check when something feels off.

**Anchor:** Progress is measured against the **session entry** already in the initiative file (goal, finish line, scope) — not against memory alone.

---

## When to run

- You have been working 2+ hours without stepping back
- You are unsure of the finish line vs what is on disk
- A fix or investigation is taking longer than expected
- You are about to context-switch or hand off to another agent
- Before ending any session longer than an hour
- Something feels off but you cannot name it

## Who can run it

Bill, Christina, Scout, or any agent. The data-gathering steps are mechanical. The assessment requires honest judgment. Do not soften findings.

## Time budget

**About 5 minutes** to run and read the output. If it takes longer, you are going too deep — flag and move on.

**Do not** run full build checks here (`python manage.py check`, `npx tsc`) — those belong in **`session_close.md`**. Exception: if you need a quick signal for a specific blocker, note it in the bearing card only.

---

## Part 1: Read the session entry

1. Open the **active initiative** from **`.ai/initiatives/_index.md`**.
2. Find the **active session** — the latest **`### Session N`** under **`## Sessions`** whose **`#### Result`** is empty or **`still open`**.
3. Copy **Goal**, **Finish line**, and **Scope** into your head. If you cannot find a session entry, **that is the first finding** — run **`startup.md` steps 8–9** or record one before continuing work.

**Drift:** If the real work no longer matches the written goal, either **update the session entry** (explicit decision) or **cut the tangent**.

---

## Part 2: Ground truth (what is on disk)

Run and record (do not interpret yet):

```
git status -sb
git diff --stat
git diff --cached --stat
git log --oneline -5
```

Note:

- Files changed (unstaged): count
- Files staged: count
- Untracked files: count and whether they look intentional or like debris
- Recent commits: do the subjects match what you believe shipped?

**If uncommitted work is large or scattered:** Decide whether it is one coherent commit, multiple commits, or needs untangling. Note the decision.

**Scope buckets.** For each changed or untracked file:

| Bucket | Meaning |
|--------|---------|
| On-mission | Directly serves the session finish line |
| Necessary dependency | Required to unblock (migration, shared util) |
| Off-scope | Unrelated — scope creep, side-fix, rabbit hole |

If **off-scope** has more than **2** items, name what pulled you away.

**Progress:** Estimate **% complete toward the written finish line** (not the whole initiative phase). If slower than expected, name the cause (e.g. “~45 min on test DB,” not “it is slow”).

---

## Part 3: Flags (rabbit holes, loose ends, environment)

**Rabbit holes** — watch for:

- Same file edited **5+** times without a commit (churn)
- Same test failing across multiple fix attempts (debug spiral)
- **2+** hours of work with no commit point (tangled changes)
- Reverted or undone work visible in the diff

If stuck in a debug spiral: time-box the next attempt (~30 min); if unresolved, write a repro note and park it.

**Loose ends** — quick scan of touched files for `TODO`, `FIXME`, `HACK`, temp filenames, `print(` debug, stubs with `pass` / `NotImplementedError`. On Windows PowerShell you may use `git diff -U0 | Select-String -Pattern 'TODO|FIXME|HACK'` or search in the IDE.

**Doc drift (flag only):** If code changed but matching **`.ai/extended/<domain>.md`** timestamps look stale, note it — fix at the next **`session_checkpoint.md`** or **`session_close.md`** (bearing only flags).

**Dependencies and environment**

- External blockers (API, design decision, prod config)
- **Commit message:** Is **`scripts/deploy/commit_message.txt`** line 1 still **`---`**? (Awareness only.)

---

## Output: Bearing card

One page max.

```markdown
## Bearing - [YYYY-MM-DD HH:MM]
**WHO:** [optional]

**Initiative:** [name]
**Session:** [N] — [scope from session entry]
**Goal:** [from session entry]
**Finish line:** [from session entry]
**Progress:** [X]% — [vs finish line]
**Time on task:** [estimate]

### Status: [CLEAN / MESSY / STUCK]

[1-2 sentences]

### Flags
[Only sections with findings — skip clean sections]

- Scope creep: [...]
- Rabbit hole: [...]
- Loose ends: [...]
- Doc drift: [...]
- Blockers: [...]

### Next action
[ONE thing — not a menu]

### Parking lot (max 3)
- [...]
```

---

## After the bearing card

Append a **timestamped line** to the active session’s **`#### Session updates`** in the initiative file, e.g.  
`Bearing: MESSY — 40% — next: fix serializer tests`

---

## Principles

**Honesty over comfort.** If progress is slower than expected, say so.

**Evidence over intuition.** The git diff is ground truth.

**Fast over thorough.** This is an instrument scan, not an audit.

**One action, not ten.** The card ends with one next step.

---

## Relationship to other protocols

| Protocol | When | Purpose |
|----------|------|---------|
| `startup.md` | Session start | Load context; frame session; create session entry |
| `session_checkpoint.md` | Several times per session | Session updates + `[Unreleased]` + light docs |
| **`get_bearing.md`** (this) | Mid-session when **stuck** / drifting | Check heading vs written goal |
| `session_close.md` | Before commit / release | Record result, docs, version bump, commit message |
| `collect_for_consultant.md` | Consultant handoff | Spot-check + copy files |

A bearing check often means it is time for **`session_checkpoint.md`** or **`session_close.md`** when you are ready to sync or commit.

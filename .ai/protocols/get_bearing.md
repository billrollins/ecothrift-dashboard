<!-- Last updated: 2026-04-09 -->
# Protocol: Get bearing

A mid-session orientation check. Run it when you've been heads-down and need an honest picture of where things stand. This is not a pre-commit gate (that's `review_bump.md`). This is a compass check you run during the work.

---

## When to run

- You've been working 2+ hours without stepping back
- You can't state the session goal in one sentence anymore
- You just finished something and aren't sure what's next
- A fix or investigation is taking longer than expected
- You're about to context-switch or hand off to another agent
- You feel productive but can't point to concrete output
- Before ending any session longer than an hour
- Something feels off but you can't name it

## Who can run it

Bill, Christina, Scout, or any agent. The data-gathering steps are mechanical. The assessment requires honest judgment. Do not soften findings.

## Time budget

5-10 minutes to run. 2 minutes to read the output. If it takes longer, you're going too deep. Flag the issue and move on.

---

## Part 1: Anchor (what were we doing)

Read the active initiative file (from `.ai/initiatives/_index.md`). Answer:

- **Initiative:** Which one? If you can't name it, that's the first finding.
- **Session goal:** What were you trying to accomplish this session, in one sentence? If it shifted from the original goal, note both.
- **Phase/step:** Where in the initiative roadmap does this session's work land?
- **Scope boundary:** What is in scope vs explicitly out of scope? Flag anything that crept in without a decision.

**If drift is found:** Either update the written goal (explicit decision) or cut the tangent. Don't leave it unnamed.

---

## Part 2: Ground truth (what's on disk)

Run these and record the output. Don't interpret yet, just gather.

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

Then run:
```
python manage.py check
cd frontend && npx tsc --noEmit
```

Note: pass or fail. If fail, is it related to current work or pre-existing?

**If uncommitted work is large or scattered:** Decide now whether it's one coherent commit, multiple commits, or needs to be untangled. Note the decision.

---

## Part 3: Scope and progress

**Scope check.** For every changed or untracked file from Part 2, ask: does this belong to the active initiative? Sort into three buckets:

| Bucket | Meaning |
|--------|---------|
| On-mission | Directly serves the session goal |
| Necessary dependency | Required to unblock the goal (migration, shared util) |
| Off-scope | Unrelated. Scope creep, side-fix, or rabbit hole |

If off-scope has more than 2 items, something pulled you away. Name it.

**Progress check.** Re-read the initiative's checklist or phase description. For each item: done, in progress, not started, or blocked. Estimate overall completion as a percentage. Compare to time spent. Is the ratio reasonable?

**If progress is slower than expected:** Name the cause. Don't just say "it's taking longer." Say "spent ~90 minutes on the test DB config issue" or "the serializer required reworking the queryset annotations."

---

## Part 4: Rabbit holes and loose ends

**Rabbit holes.** Look for these patterns:
- Same file edited 5+ times without a commit (churn)
- Same test failing across multiple fix attempts (debug spiral)
- 2+ hours of work with no commit point (tangled changes)
- Reverted or undone work visible in the diff (approach may need rethinking)

If any are present, name the file or test and estimate time spent.

**If stuck in a debug spiral:** Time-box the next attempt (30 min). If unresolved, write a repro note and park it.

**Loose ends.** Quick scan of touched files:
```
git diff -U0 | grep -E "TODO|FIXME|HACK|XXX|TEMP|PLACEHOLDER"
```

Also check for: temp files (`_test.txt`, `_debug`, `_scratch`, `_agent_test`), dead imports, commented-out code blocks, `print(` debug statements, function stubs with `pass` or `NotImplementedError`.

Classify each: blocker (must fix before shipping), cleanup (should fix soon), or park (note and move on).

**If scaffolding or temp files are piling up:** Delete what's served its purpose. Don't let it accumulate across sessions.

---

## Part 5: Doc and decision drift

**Doc check.** For each code area touched this session, check whether the corresponding doc's timestamp predates the work:

| Code area | Doc to check |
|-----------|-------------|
| `apps/*/models.py` | `.ai/extended/backend.md` |
| `apps/*/api_views.py`, `urls.py` | `.ai/extended/backend.md` or domain doc |
| `frontend/src/` | `.ai/extended/frontend.md` |
| Management commands | Initiative file, `backend.md` |
| Settings, env vars | `.ai/extended/development.md` |

If stale, note which doc and what's missing. Don't fix it now (that's `review_bump.md` territory), just flag it.

**Decision check.** Were any decisions made this session that exist only in chat? Design choices, rejected approaches, "we decided X instead of Y." If the next session started cold, would those decisions be discoverable? If not, note what needs to be written down and where.

**If decisions are unrecorded:** Add one line to the initiative file or `CHANGELOG [Unreleased]` before the session ends. Don't rely on memory.

---

## Part 6: Dependencies and environment

- **Blockers:** Anything external blocking progress? (API access, design decision, prod config, another person's input)
- **Migrations:** Any unapplied? (`python manage.py showmigrations | grep "\\[ \\]"`)
- **Environment:** Running dev servers that should be stopped? Test databases left behind? Stale `__pycache__` in git status?
- **Commit message:** Is `scripts/deploy/commit_message.txt` updated? Is line 1 a real subject or still `---`?

---

## Output: Bearing card

Compile everything into this template. One page max. If it's longer, cut it down.

```markdown
## Bearing - [YYYY-MM-DD HH:MM]
**WHO:** [name of bearing setter]

**Initiative:** [name]
**Session goal:** [one sentence. Note if shifted from original.]
**Progress:** [X]% - [what's done in plain language]
**Time on task:** [estimate]

### Status: [CLEAN / MESSY / STUCK]

- CLEAN: Work is focused, tests pass, next step is clear.
- MESSY: Work is scattered or docs are behind but nothing is broken. Needs cleanup before moving forward.
- STUCK: Something is blocking progress. [Name the blocker.]

[1-2 sentences explaining the status call.]

### Shipped this session
- [concrete items only]

### Still open
- [remaining work, priority order, blockers noted]

### Flags
[Only include sections with findings. Skip clean sections.]

- Scope creep: [what and how it got in]
- Rabbit hole: [file/test, time spent, resolution or park decision]
- Loose ends: [TODOs, stubs, temp files with paths]
- Doc drift: [which docs, what's missing]
- Uncommitted work: [what's sitting and whether it's committable]
- Unrecorded decisions: [decisions from chat not yet written down]
- Blockers: [external dependencies]

### Next action
[ONE thing. The single most important next step. Not a menu.]

### Parking lot (max 3)
- [things that matter but aren't urgent]
```

---

## Principles

**Honesty over comfort.** If progress is slower than expected, say so. If the approach isn't working, name it. The entire value of this protocol is accurate orientation.

**Evidence over intuition.** The git diff is the ground truth. When your sense of progress disagrees with what the diff shows, trust the diff.

**Fast over thorough.** This is an instrument scan, not an audit. If something needs deeper investigation, flag it and move on. Do not turn the bearing check into another rabbit hole.

**One action, not ten.** The bearing card ends with one next action. The reader should finish and know exactly what to do.

---

## Relationship to other protocols

| Protocol | When | Purpose |
|----------|------|---------|
| `startup.md` | Session start | Load context, orient to the project |
| **`get_bearing.md`** (this) | **Mid-session** | **Check heading, catch drift, surface problems early** |
| `review_bump.md` | Pre-commit / pre-release | Full doc audit, version bump, commit staging, handoff |
| `collect_for_consultant.md` | After a build phase | Update docs, collect files for consultant handoff |

A bearing check often reveals it's time to run `review_bump.md`. That's fine. They're complementary, not redundant.

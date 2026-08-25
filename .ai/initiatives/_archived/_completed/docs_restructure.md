<!-- Archived 2026-04-10: disposition=completed (session protocols, context prune, initiative archiving — no semver bump; docs-only) -->
<!-- initiative: slug=docs-restructure status=completed updated=2026-04-10 -->
<!-- Last updated: 2026-04-10T14:15:00-05:00 -->
# Initiative: .ai documentation restructure

**Status:** Completed

**Current phase:** Complete — archived 2026-04-10.

---

## Context

Steering docs and protocols tracked **what shipped** well but not **what is happening between commits**. Sessions (goal, finish line, scope) had no canonical home. This initiative introduces session entries inside initiative files, replaces `review.0.Bump.md` with `session.9.Close.md`, rewrites `code.0.Startup.md` and `code.1.Bearing.md`, prunes `context.md` redundancy, and generalizes `collect_for_consultant.md`.

---

## Objectives

1. **Session as first-class unit:** Goal, scope, finish line, and updates live in the owning initiative file.
2. **Clear protocol lifecycle:** startup → work → optional bearing → session close → commit.
3. **Single source of truth per fact:** See redundancy map in the plan; `context.md` becomes capability pointers, not a feature dump.
4. **Preserve multi-session commit messages:** `commit_message.txt` stays append-only between pushes.

---

## Non-negotiables

- No new tooling or scripts — markdown and discipline only.
- Do not modify `.ai/extended/` content except relocating domain warnings from archived `review_bump`.
- Do not touch archived initiative files or `.ai/debug/` without cause. **`.ai/personas/`** and **`.ai/reference/`** are no longer in the tree.

---

## Phased plan

### Phase 1: Foundation — protocols and index — **done**

New `session.9.Close.md`; rewrite `code.0.Startup.md`, `code.1.Bearing.md`; delete `review.0.Bump.md`; update `_index.md` table; fix cross-links across repo.

### Phase 2: Initiative session logs — **done**

Add `## Sessions` to active initiative files; prune shipped phase text to summaries where planned.

### Phase 3: Redundancy cleanup — **done**

Prune `context.md` Working section; move domain notes from archived `review_bump` into extended docs; rewrite `collect_for_consultant.md`; remove temporary archive after porting.

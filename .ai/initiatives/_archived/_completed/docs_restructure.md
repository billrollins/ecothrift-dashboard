<!-- Archived 2026-04-10: disposition=completed (session protocols, context prune, initiative archiving — no semver bump; docs-only) -->
<!-- initiative: slug=docs-restructure status=completed updated=2026-04-10 -->
<!-- Last updated: 2026-04-10T14:15:00-05:00 -->
# Initiative: .ai documentation restructure

**Status:** Completed

**Current phase:** Complete — archived 2026-04-10.

---

## Context

Steering docs and protocols tracked **what shipped** well but not **what is happening between commits**. Sessions (goal, finish line, scope) had no canonical home. This initiative introduces session entries inside initiative files, replaces `review_bump.md` with `session_close.md`, rewrites `startup.md` and `get_bearing.md`, prunes `context.md` redundancy, and generalizes `collect_for_consultant.md`.

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

New `session_close.md`; rewrite `startup.md`, `get_bearing.md`; delete `review_bump.md`; update `_index.md` table; fix cross-links across repo.

### Phase 2: Initiative session logs — **done**

Add `## Sessions` to active initiative files; prune shipped phase text to summaries where planned.

### Phase 3: Redundancy cleanup — **done**

Prune `context.md` Working section; move domain notes from archived `review_bump` into extended docs; rewrite `collect_for_consultant.md`; remove temporary archive after porting.

---

## Sessions

### Session 1 — Implement restructure (Waves 1–4) — est 4h — started 2026-04-10T09:00:00-05:00

**Goal:** Implement the approved plan: new protocols, initiative updates, context prune, consultant protocol, link sweep.

**Finish line:** All plan waves done; `review_bump.md` removed; references point to `session_close.md`; archive checklist satisfied.

**Scope:** `.ai/protocols/`, `.ai/initiatives/`, `.ai/context.md`, `.ai/extended/` (warning relocations only), `README.md`, initiative lifecycle protocol links.

#### Session updates

- 2026-04-10T09:00:00-05:00 Session started — branched work from `origin/main` at `28d1352`; Wave 1 protocols first (`session_close`, `startup`, `get_bearing`, delete `review_bump`).
- 2026-04-10T10:20:00-05:00 `_index` Phase + Notes columns; link sweep across README / CHANGELOG / lifecycle docs.
- 2026-04-10T11:10:00-05:00 `context` Working prune; guardrails moved to `extended/frontend` + `extended/retag-operations`; `collect_for_consultant` generalized.
- 2026-04-10T12:00:00-05:00 Added `Sessions` scaffolding to buying + historical initiatives; dogfood `docs_restructure` initiative; `[Unreleased]` CHANGELOG bullet for steering work.

#### Result

Completed — committed (no semver bump) — docs-only steering under **`[Unreleased]`** in `CHANGELOG.md` (local `main` ahead of `origin/main` at `28d1352`; no `.version` change).

---

## Acceptance

- [x] **Phase 1 complete:** `session_close.md`; `startup` / `get_bearing` rewritten; `review_bump.md` deleted; `_index` + link sweep.
- [x] **Phase 2 complete:** `Sessions` sections in `bstock_auction_intelligence.md`, `historical_sell_through_analysis.md` (acceptance + current phase for historical).
- [x] **Phase 3 complete:** `context.md` Working pruned; guardrails in `extended/frontend.md`, `extended/retag-operations.md`; `collect_for_consultant.md` generalized; archive copy removed after porting.
- [x] **Phase 4 complete:** First implementation session used the new startup/session format; friction: agents should confirm `### Session` numbering when multiple initiatives are touched in one day.

### Wave 4 — friction notes

- **Multi-initiative days:** If work jumps initiatives, close or update the session **Result** in the first initiative before opening Session N+1 in another file.
- **`commit_message.txt`:** Line 1 remains the deploy script subject; append session blocks on lines 2+ between pushes (see `session_close.md` Part 3).

## See also

- [`.ai/protocols/session_close.md`](../../protocols/session_close.md)
- [`.ai/protocols/startup.md`](../../protocols/startup.md)
- [`.ai/initiatives/_index.md`](../_index.md)

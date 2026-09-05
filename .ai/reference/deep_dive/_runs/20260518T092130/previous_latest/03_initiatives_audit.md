# Initiatives Audit — 2026-05-18

## Executive Summary

- **Single active umbrella:** **`order_processing_pipeline_rebuild`** (`.ai/initiatives/_index.md` row ✅).
- **Session hygiene:** **`Session 14`** closed out as discovery; **`Session 15 — Intake rebuild stabilization wave`** now owns deterministic execution steps (**`Current Execution Steps`** checklist added earlier).
- **Archive discipline:** untouched this run per protocol — **human approval** gate on moves.
- **Confidence:** **High** for `_index.md` row presence; **Medium** whether **Final Review redesign** bullets in **`CHANGELOG [Unreleased]`** still rank equal priority vs intake wave (execution order risk only).

## Active Table (`_index.md`)

| Initiative | Phase | Accuracy vs tree | Recommendation |
|---|---|---|---|
| **`order_processing_pipeline_rebuild`** | Active | **`Notes`** cite Session 15 + **`_sql`/`_recon`** links ✅ | Maintain row when shipping release; update phase text when MINOR ships |

## `order_processing_pipeline_rebuild.md`

| Area | Observation |
|---|---|
| **Current Operating Scope** | ✅ Captures orders UI + migrations + preprocessing/receiving/process handoff + disputes/repair |
| **Current Execution Steps** | ✅ Eight ordered checkpoints map to rehearsal user ran (pull prod → migrate → repair) |
| **Scope Ledger** | ✅ Groups WT file clusters |
| **Sessions** | 14 ✅ marked discovery result; **15 ✅ active** |

## Lifecycle candidates (⚠ approvals required)

| Item | Potential disposition | Blocker |
|---|---|---|
| None flagged for immediate archive | — | Initiative still materially open |

## Risks / Gaps

| Risk | Detail |
|---|---|
| **Parallel narrative debt** | Long historical sessions (1–13) remain verbose — acceptable archaeology but increases scroll cost |
| **Scope creep recurrence** | If new domains (Buying, POS) land in same commit as intake, reviewer fatigue → PLAN suggests split PRs (**user decision**) |

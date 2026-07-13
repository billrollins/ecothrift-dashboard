<!-- Last updated: 2026-07-10T15:47:00-05:00 -->
# TARS Phase 1 — Pilot Record

**Status:** **Accepted — 2026-07-10.** Bill accepted the functioning MVP from representative automated coverage. Ashley/Mike live use feeds continuous improvement and is not a functionality gate.

**Initiative:** [`tars_full_instruction_wizard_guidance`](../../initiatives/tars_full_instruction_wizard_guidance.md)

## Build under test

- Processing saves a versioned, read-only handoff: tested status, condition evidence, unknowns, and optional quick tests.
- TARS uses one integrated, autosaved Guided decision surface inside the live workstation.
- The saved `decisionWork` record includes applied schema/catalog versions, stop-outs, condition/completeness, structured tests, unknowns, viable paths, authoritative economics, recommendation, selection, reason, override identity, and timestamps.
- Existing queue, bench, timer, Work Bench log, parts, hold, pending, completion, return, split, and requeue behavior remains authoritative.

## Automated representative-item matrix

| Scenario | Expected behavior | Evidence |
|---|---|---|
| New Processing handoff | Defaults to explicit untested; optional evidence remains optional | `processingHandoff.test.ts` |
| Partial Processing testing | Quick results and unknowns survive create/edit and appear on the job | `test_handoff_create_edit_and_read_only_job_surface` |
| Legacy/scan-added job | Missing structured handoff degrades to a clear empty state | `test_handoff_caps_and_legacy_absence` |
| Normal tested path | Complete evidence and valid selection can complete | `test_completion_gate_override_and_mandatory_stop_out` |
| Untested/as-is path | Zero entered work still receives five handling minutes | `tarsDecisionEngine.test.ts` |
| Salvage path | Zero entered work receives three handling minutes | `tarsDecisionEngine.test.ts` |
| Missing parts/order cost | Attached order totals reduce contribution and ranking | `test_valid_round_trip_recomputes_economics_and_preserves_session` |
| Ordinary missing evidence | Completion is blocked unless an identified override reason is saved | `test_completion_gate_override_and_mandatory_stop_out` |
| Missing required decision | Override cannot replace outcome, grade, action, sale state, or reason | `test_override_cannot_replace_required_selection` |
| Legal/prohibited stop | Normal sale path is blocked; compatible salvage remains available | backend + frontend stop-out tests |
| Handling stop | All completion selections are blocked; Hold remains the recovery path | `tarsDecisionEngine.test.ts` |
| Split/requeue | Processing handoff survives; mutable work session resets on rework as designed | `test_handoff_survives_split_and_requeue` |

## Automated readiness result

- Backend restoration/processing regression matrix: **127 tests passed**.
- Focused Phase 1 backend contract suite: **10 tests passed**.
- Frontend suite: **256 tests passed across 35 files**.
- Frontend production build: **passed**.
- TypeScript, Python compile, migration check, diff formatting, and IDE diagnostics: **passed**.

## Post-acceptance continuous-improvement observation

### Ashley

As restoration handoffs occur, observe:

- tested status is fast and unambiguous;
- condition evidence/unknowns capture only decision-changing context;
- quick tests do not duplicate work Ashley already performs;
- saved handoff is accurately represented in Mike's queue and bench views.

### Mike + Bill

Across early live items covering normal restoration, untested/as-is, missing parts, unresolved unknowns, hold, ordinary override, and a mandatory stop-out/disclosure case, observe:

- Mike can complete the flow with the agreed coaching level;
- recommendations are understandable and economically credible;
- the app never treats margin as permission to ignore a mandatory stop-out;
- a lower-ranked selection preserves a useful reason;
- parts, pending/resume, timer, execution log, and completion still match the physical workflow.

### Continuous-improvement owners

- Ashley reports Processing handoff accuracy/usability friction.
- Mike reports Restoration guardrail accuracy/usability friction.
- Bill + Mike review mandatory stop-outs, overrides, and economic decision behavior.
- Bill decides product changes and Phase 2 priority without waiting for pre-use certainty.

## Initial Phase 2 backlog candidates

Prioritize only after observed use:

1. Bill-managed catalog/template editing, activation, effective versions, and rollback.
2. Category-specific tests only where universal + custom tests repeatedly fail.
3. Decision/override review view for Bill.
4. Calibrated backlog adjustment only after enough observed decisions exist.
5. Applied-version history across rework instead of the Phase 1 work-session reset.
6. Repair the legacy `actions` versus `benchRows` dashboard metric before using it for adoption.

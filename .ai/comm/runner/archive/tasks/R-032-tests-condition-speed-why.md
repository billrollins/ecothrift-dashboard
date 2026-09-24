> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-032 · Tests: condition shrink, sell speed, the "why" line

- **Type:** test · **Snapshot ref:** `refs/runner/R-032` (`d06603a3`; re-snapshotted with the R-026 fix) · **Compare-to:** `9e969a42`
- **What changed (on top of R-026):**
  - `apps/buying/services/condition.py` and the shrink-per-condition logic in valuation and serializers;
  - `CategoryStats.sell_through_30_pct`, `auction_speed_from_mix`, and the speed weight in `compute_priority`;
  - `auction_why` and the `why` field;
  - migrations `buying/0029` and `buying/0030`;
  - settings registry and Assumptions keys;
  - the `priorityNote` speed text;
  - the list title tooltip and the detail caption.

## Run
1. `py: apps/buying apps/core apps/floorplan apps/labels`
2. `vitest`
3. `tsc`
4. `migrations-check`

## Expect
New tests pass: `test_condition.py`, `test_speed.py`, `test_auction_why.py`. The `settingsRegistry` and `buyingCostNotes` vitest suites pass with the new keys.

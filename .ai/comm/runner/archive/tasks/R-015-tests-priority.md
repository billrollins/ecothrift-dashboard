> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-015 · test · Priority v2 and Need coverage

- **Snapshot:** `refs/runner/R-015` (`b98f31a5`, working tree on top of `50bf6143`)
- **Compare-to:** `50bf6143` (v2.98.0)
- **Why:**
  - Priority blends Need and a profit score. Adds migration `buying/0027`.
  - The Need panel shows coverage.
  - New notes on the auction card.
- **Run:**
  1. `py: apps/buying`
  2. `vitest`
  3. `tsc`
  4. `migrations-check`
- **Expect:**
  - GREEN.
  - The new `PriorityTests` in `test_need_v2.py` and the `needNote and priorityNote` test in `buyingCostNotes.test.ts` pass.
- **Result:** `results/R-015-tests-priority.md`. Archive when done, per the protocol.

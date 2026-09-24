> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-019 · test · Focus chip

- **Snapshot:** `refs/runner/R-019` (`720677f7`, on top of `9e969a42` v2.99.0)
- **Compare-to:** `9e969a42`
- **Why:** the Focus filter on the auction and watchlist lists, plus the chip.
- **Run:**
  1. `py: apps/buying`
  2. `vitest`
  3. `tsc`
  4. `migrations-check`
- **Expect:** GREEN, and the new `FocusFilterTests` passes.
- **Result:** `results/R-019-tests-focus.md`. Archive when done.

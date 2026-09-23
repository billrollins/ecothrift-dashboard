> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-008 · test · Need v2 and the R-001 fixes

- **Snapshot:** `refs/runner/R-008` (`8007f4cb`, working tree on top of `ecc60707`)
- **Compare-to:** `ecc60707`
- **Why:**
  - Fixes for R-001's 3 NEW failures: the pull deadline vs the Costco refresh, the `shipping_estimate` key, and the seeded Franklin row.
  - Need v2: weeks of cover with pipeline, target and goals. Adds migration `buying/0026`, a goals endpoint, panel UI, and 3 settings.
- **Run:**
  1. `py: apps/buying`
  2. `vitest`
  3. `tsc`
  4. `migrations-check`
- **Expect:**
  - R-001's 3 NEW keys pass.
  - New `apps/buying/tests/test_need_v2.py` passes.
  - `settingsRegistry.test.ts` passes with `buying_target_cover_weeks` and `buying_pipeline_max_age_days`.
  - No test reaches B-Stock or Google.
- **Result:** `results/R-008-tests-need-v2.md`, in the test shape. Update it as each command finishes.

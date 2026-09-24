> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-020 · test · 23 categories, B-Stock code mapping, Focus

- **Snapshot:** `refs/runner/R-020` (`e78fdd81`, on top of `9e969a42` v2.99.0; includes R-019's Focus)
- **Compare-to:** `9e969a42`
- **Why:**
  - The taxonomy goes from 19 to 23 categories. Adds migration `buying/0028`.
  - `canonical_category_name` now maps B-Stock codes.
  - The webstore stays on 19.
  - The Focus filter.
- **Run:**
  1. `py: apps/buying apps/inventory apps/webstore`
  2. `vitest`
  3. `tsc`
  4. `migrations-check`
- **Expect:**
  - GREEN against the baseline.
  - New `CategoryCodeMappingTests` and `FocusFilterTests` pass.
  - Watch `apps/webstore` and inventory category tests: report any NEW failure there first.
- **Result:** `results/R-020-tests-categories-23.md`. Archive when done.

> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-066 · Tests: the hazard rules after R-060, and the R-065 fixes

- **Type:** test · **Snapshot ref:** `refs/runner/R-066` (`767f7c76`) · **Compare-to:** `f6fd6051` (v2.103.0, production)
- **What changed since R-065's snapshot (`767f7c76`):**
  - `apps/buying/services/manifest_analysis.py`, from R-060:
    - `PART_RE` requires the word "of";
    - new `INCOMPLETE_TITLE_RE` for titles, while the condition and notes keep `INCOMPLETE_RE`;
    - `FRAGILE_RE` drops bare tv, mug and plate and adds real TVs;
    - new `NO_GLASS_RE`.
  - New test `test_the_r060_false_hazards_are_gone` in `apps/buying/tests/test_manifest_analysis.py`.
  - **Fixes for R-065's 7 NEW failures:**
    - `test_won_to_po.py`: the setUp now uses `update_or_create` for vendor TRGET, which `inventory.0033` seeds.
    - `test_close_model_fit.py`: Costco is too thin to fit, so it keeps its current ratio (0.081, now in the defaults); the test expects that.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/buying`

## Expect
- `tsc` exits 0.
- vitest and `apps/buying` have 0 NEW failures.
- For any failure, give the test id and its first error line.

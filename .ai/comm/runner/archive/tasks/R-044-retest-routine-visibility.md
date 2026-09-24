> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-044 · Retest: routine visibility (R-043 fixes)

- **Type:** test · **Snapshot ref:** `refs/runner/R-044` (`bc920730`) · **Compare-to:** `2d1e2c5e`
- **What changed since R-043:**
  - `test_reassigning_an_owners_check_covers_today_and_is_not_recreated` now patches `expire_open_runs`: its day is in the past, so expiry closed the cover before the check;
  - `DayPunchesTests` uses distinct clock-in times (the unique constraint);
  - the v2.101.1 changelog and version.

## Run
1. `py: apps/routines/tests_qa.py` (not collected by default, as R-043 found; use a separate test database like R-043)
2. `py: apps/routines apps/pos`

## Expect
- 0 NEW. The two R-043 NEW failures pass; the 12 baseline keys in `tests_qa.py` are unchanged.
- Report any NEW failure in POS separately.

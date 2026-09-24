> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-046 · Tests: a finished shared checklist is not created again

- **Type:** test · **Snapshot ref:** `refs/runner/R-046` (`28ceb600`) · **Compare-to:** `add2f70b` (v2.101.1, production)
- **Why:** production had two Opening checklists on 09-24, Carrie's (done 1:56 pm) and a new shared one (done 2:23 pm). `materialize_routines` only looked for an **open** shared run, so a finished one that had been assigned to someone got re-created.
- **What changed (on top of R-045):** in `apps/routines/schedule.py`, the pooled and shift-locked path now counts any run for the period. New test: `SectionRoutineTests::test_a_finished_shared_checklist_is_not_created_again` in `apps/routines/tests.py`.

## Run
1. `py: apps/routines`
2. `py: apps/routines/tests_qa.py apps/routines/tests_pool.py apps/routines/tests_overlap.py` (not collected by default; use a separate test database)

## Expect
0 NEW. The new test passes. `tests_pool.py` and `tests_overlap.py` exercise shared runs, so report anything NEW there separately.

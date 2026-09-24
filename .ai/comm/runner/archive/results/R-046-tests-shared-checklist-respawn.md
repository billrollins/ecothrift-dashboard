# R-046 · Tests: a finished shared checklist is not created again
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 11:24 · **Finished:** 2026-09-24 11:38 · **Status:** done · **RED**

Snapshot `28ceb600` (`refs/runner/R-046`). Compare-to `add2f70b`. Logs: `workspace/runner/R-046/`.

Step 2 used a separate test database (`DATABASE_NAME=r046_qa`).

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/routines | 33 failed, 57 passed, 164.34s, exit 1 | 1 | 32 | none |
| py: apps/routines/tests_qa.py apps/routines/tests_pool.py apps/routines/tests_overlap.py | 10 failed, 104 passed, 2 errors, 227.03s, exit 1 | 0 | 12 | none |

## Expect

The new test did not pass. `tests_pool.py` and `tests_overlap.py` added no NEW failures (every FAILED and ERROR line is in `tests_qa.py`, and those 12 keys are already in the baseline).

## NEW failures

This test does not exist on `add2f70b` (`compare-1-py.log`: `ERROR: not found`).

- `apps/routines/tests.py::SectionRoutineTests::test_a_finished_shared_checklist_is_not_created_again` — `django.db.utils.IntegrityError: duplicate key value violates unique constraint "hr_department_name_key"` (`1-py.log`)

## Baseline

Nothing added.

## Now passing

None.

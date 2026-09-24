# R-043 · Tests: routine visibility (today-only covers, owners, punches)
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 10:33 · **Finished:** 2026-09-24 10:48 · **Status:** done · **RED**

Snapshot `f1a0796a` (`refs/runner/R-043`). Compare-to `2d1e2c5e`. Logs: `workspace/runner/R-043/`.

`pytest.ini` collects `test_*.py` and `tests.py` only, so the numbered pytest command does not collect `apps/routines/tests_qa.py`. A second pytest named that file (`1b-py-qa.log`, separate test database `r043_qa`).

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/routines apps/hr apps/pos apps/inventory | 117 failed, 943 passed, 641.17s, exit 1 | 0 | 112 `FAILED` nodes + 5 `SUBFAILED` on the preprocessing status-table test | none |
| py: apps/routines/tests_qa.py | 12 failed, 91 passed, 2 errors, 213.80s, exit 1 | 2 | 12 (confirmed on `2d1e2c5e`, added to baseline) | none |
| vitest | 9 failed, 1157 passed, 188 files (6 failed), exit 1 | 0 | 9 tests + RestorationQueuePage file | — |
| tsc | exit 0 | 0 | 0 | — |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## Expect

- New tests that passed: `test_command_center_owner_pick_is_today_only`, `test_owners_form_skips_an_aisle_covered_today`.
- **Routines (default collection, `tests.py`):** no NEW failure. Command Center tests in `tests.py` did not add a failure outside the baseline.
- **POS:** no NEW failure. Only the two baseline delivery tests failed.
- **`tests_qa.py`:** two new tests failed. Twelve other failures also fail on `2d1e2c5e` (Retail department seed collision, fixture `user_id` not found, and three assertion mismatches).

## NEW failures

These two tests do not exist on `2d1e2c5e` (`compare-1-py.log`: `ERROR: not found`).

- `apps/routines/tests_qa.py::AssignmentVisibilityTests::test_reassigning_an_owners_check_covers_today_and_is_not_recreated` — `AssertionError: True is not false` (`1b-py-qa.log`)
- `apps/routines/tests_qa.py::DayPunchesTests::test_open_punch_wins_then_latest_end` — `django.db.utils.IntegrityError: duplicate key value violates unique constraint "hr_timeentry_employee_id_date_clock_in_da76a6e9_uniq"` (`1b-py-qa.log`)

## Baseline

Appended 12 `tests_qa.py` keys that fail on `2d1e2c5e` (`confirmed R-043 @ 2d1e2c5e`).

## Now passing

None. `test_preprocessing_status_completed_step_table_per_preprocess_status` still has five `SUBFAILED` rows.

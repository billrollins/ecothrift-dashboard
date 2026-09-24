# R-045 · Tests: routines in one place (Today, one count, one set of words)
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 11:23 · **Finished:** 2026-09-24 11:33 · **Status:** done · **RED**

Snapshot `9b18d709` (`refs/runner/R-045`). Compare-to `add2f70b`. Logs: `workspace/runner/R-045/`.

`tests_qa.py` used a separate test database (`DATABASE_NAME=r045_qa`).

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 13 failed, 1160 passed, 189 files (8 failed), 204.57s, exit 1 | 4 | 9 tests + RestorationQueuePage file | none |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/routines apps/hr | 32 failed, 127 passed, 422.25s, exit 1 | 0 | 32 `tests.py` keys | none |
| py: apps/routines/tests_qa.py | 10 failed, 93 passed, 2 errors, 405.15s, exit 1 | 0 | 12 baseline keys | none |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## Expect

- `myWork.test.ts` is not in the vitest failure list.
- **`pages/routines`:** 3 NEW failures (below). No NEW failure whose test file is under `components/layout` or `components/routines`. The PayPage and Today desk failures throw inside `FloorNav` (`useNavBadgeTones`).
- **Pytest:** no NEW failure. Nothing new touching `/api/routines/today/` or `runs/mine`. `tests_qa.py` is the same 12 baseline keys as R-044.

## NEW failures

These pass on `add2f70b` (`compare-1-vitest.log`: 5 passed, and the only failure there is the baseline Today desk-punch test). `shows the same To do today list beside the desk runner, without the catalog toggle` is not on `add2f70b`.

- `src/pages/hr/PayPage.test.tsx > PayPage > shows three cards and the shifts grid on a desk, with no punch` — `Error: [vitest] No "useNavBadgeTones" export is defined on the "../../hooks/useNavBadgeCounts" mock.` (`1-vitest.log`)
- `src/pages/routines/RoutinesPage.test.tsx > RoutinesPage > shows the same To do today list beside the desk runner, without the catalog toggle` — `Error: [vitest] No "useRoutineSubmission" export is defined on the "../../hooks/useRoutines" mock.` (`1-vitest.log`)
- `src/pages/routines/RoutinesPage.test.tsx > RoutinesPage > renders the list in Spanish when the user language is es` — `Error: [vitest] No "useRoutineSubmission" export is defined on the "../../hooks/useRoutines" mock.` (`1-vitest.log`)
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the phone Today without the week bar` — `TestingLibraryElementError: Unable to find an element with the text: Pick your shift to see your day.` (`1-vitest.log`)

## Baseline

Nothing added.

## Now passing

None.

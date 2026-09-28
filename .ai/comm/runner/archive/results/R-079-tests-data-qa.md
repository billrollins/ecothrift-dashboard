# R-079 · Tests: data QA (data_platform Phase 3), and the QA section in the morning brief
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 17:14 · **Finished:** 2026-09-25 17:19 · **Status:** done · **RED**

Snapshot `76927636` (`refs/runner/R-079`). Compare-to `737f928d` (`refs/runner/R-078`). Logs: `workspace/runner/R-079/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1246 passed (1255), 4 files failed, exit 1 | 0 | 9 tests + RestorationQueuePage file | 6 baseline keys |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/qa apps/core apps/pos/tests/test_cart_totals.py | 1 failed, 98 passed, 170.36s, exit 1 | 1 | 0 | — |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

`RequestsPage.test.tsx` is not in the fail list. `QAPage.test.tsx` is not in the fail list (one more passing test than R-078).

## migrations-check

Only the two known webstore lines.

## NEW failures

`apps/qa/tests/test_qa.py` is absent at `737f928d`, so this failure is NEW. Log: `3-py.log`.

- `apps/qa/tests/test_qa.py::QaRunTests::test_a_broken_check_is_recorded_and_the_rest_still_run` — `apps.qa.models.QAFinding.MultipleObjectsReturned: get() returned more than one QAFinding -- it returned 2!`

## Known failures

- `src/pages/restoration/queue/RestorationQueuePage.test.tsx` — `Error: EMFILE: too many open files, open 'C:\Coding\ecothrift-test\frontend\node_modules\@mui\icons-material\esm\SettingsInputCompositeSharp.js'`
- `src/noDashes.test.ts > no em or en dashes in src > keeps labels and comments in ASCII punctuation` — `AssertionError: expected [ …(19) ] to deeply equal []`
- `src/pages/online-sales/ListingStudioPage.test.tsx > ListingStudioPage > renders listing studio with linked item` — `Error: [vitest] No "useReframeWebListingImage" export is defined on the "../../hooks/useWebStore" mock. Did you forget to return it from "vi.mock"?`
- `src/pages/online-sales/ListingStudioPage.test.tsx > ListingStudioPage > keeps Delete and Mark sold out of reach until the overflow is opened` — same `useReframeWebListingImage` error
- `src/pages/online-sales/ListingStudioPage.test.tsx > ListingStudioPage > renders unlinked listing without crashing` — same `useReframeWebListingImage` error
- `src/pages/routines/myWork.test.ts > buildMyWork > grades today into Do now, Due soon, Later today; counts all of it, nags on the first two` — `AssertionError: expected 2 to be 5 // Object.is equality`
- `src/pages/routines/myWork.test.ts > buildMyWork > is amber when only soft nags, and quiet when nothing has reached its reminder` — `AssertionError: expected [ +0, +0, 'none' ] to deeply equal [ 1, 1, 'amber' ]`
- `src/pages/routines/myWork.test.ts > buildMyWork > leads with the shift checklist within the same colour, never above something red` — `AssertionError: expected undefined to be 9 // Object.is equality`
- `src/pages/routines/myWork.test.ts > buildMyWork > never counts drafts, anytime routines, or done work; says Continue for started runs` — `AssertionError: expected +0 to be 1 // Object.is equality`
- `src/pages/routines/myWork.test.ts > buildMyWork > speaks Spanish` — `TypeError: Cannot read properties of undefined (reading 'label')`

## Baseline

Nothing added. Nothing pruned.

## Now passing

Vitest baseline keys that passed, not pruned:

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in`
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column and the pick-your-shift line`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once`

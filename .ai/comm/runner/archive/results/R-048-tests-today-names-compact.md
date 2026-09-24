# R-048 · Tests: Dashboard / Today names, compact clock card, tighter Hours & pay
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 12:08 · **Finished:** 2026-09-24 12:12 · **Status:** done · **GREEN**

Snapshot `9128ecd1` (`refs/runner/R-048`). Compare-to `73662f5b` (`refs/runner/R-047`). Logs: `workspace/runner/R-048/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1173 passed, 190 files (6 failed), 159.21s, exit 1 | 0 | 9 tests + RestorationQueuePage file | none |
| tsc | exit 0 | 0 | 0 | — |

## Expect

`tsc` exit 0. No NEW vitest failures against R-047.

## Focused vitest failures

`components/layout`: none.

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out` — `Error: No QueryClient set, use QueryClientProvider to set one` (known)
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in` — `Error: No QueryClient set, use QueryClientProvider to set one` (known)
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line` — `Error: No QueryClient set, use QueryClientProvider to set one` (known)
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt` — `AssertionError: expected [ <button …(3)>…(3)</button> ] to have a length of 8 but got 1` (known)
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once` — `AssertionError: expected 3 to be greater than or equal to 7` (known; fails the same way on `73662f5b`, `compare-1-vitest.log`)

## NEW failures

None.

## Baseline

Appended the TodayPage key (`confirmed R-048 @ 73662f5b`).

## Now passing

None.

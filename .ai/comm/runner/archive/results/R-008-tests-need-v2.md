# R-008 result · Need v2 and the R-001 fixes

**Status:** RED

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 13:17 · **Finished:** 2026-09-23 13:22

Snapshot `8007f4cb` (`refs/runner/R-008`). Compare-to `ecc60707`. Logs: `workspace/runner/R-008/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py | 197 passed, 50 subtests passed (140.64s) | 0 | 0 | 0 |
| vitest | 9 failed, 1155 passed (1164); 6 failed files, 181 passed (187); 1 failed suite (88.26s) | 0 | 10 | 0 |
| tsc | 1 error, exit 2 | 1 | 0 | 0 |
| migrations-check | 2 operation lines, exit 1 | 0 | 2 | 0 |

## NEW

1. `src/api/buying.api.ts: TS2304 Cannot find name 'BuyingCategoryGoal'.` — log `3-tsc.log`
   - `src/api/buying.api.ts(296,9): error TS2304: Cannot find name 'BuyingCategoryGoal'.`
   - Passes at `ecc60707`: tsc exit 0, empty log (`compare-3-tsc.log`).

## Baseline

Nothing appended.

## Now passing

None. Every baseline vitest key in this run failed again. This pytest selection does not include the baseline py keys.

## Expect

- R-001's 3 NEW keys are in this tree and the buying suite had no failures, so these passed: `test_deadline_requeues_and_resume_finishes_the_same_list`, `test_override_beats_the_quote`, `test_ensure_origin_miles_looks_up_only_new_cities`.
- `apps/buying/tests/test_need_v2.py` passed with the rest of `apps/buying` (197 passed, 0 failed).
- `settingsRegistry.test.ts` is not among the six failed vitest files, so it passed, including `buying_target_cover_weeks` and `buying_pipeline_max_age_days`.
- No live B-Stock or Google call found. `test_manifest_pull.py` patches `scraper.requests.request`. `test_shipping_quote.py` patches `lookup_driving_miles` or `_http_post_json` / `_maps_api_key`. `test_need_v2.py` uses the Django test client only. The logs have no connection error to those hosts.

Known vitest keys (all failed again): the three `ShiftHeroCard` tests, `TodayPhone`, `noDashes`, the three `ListingStudioPage` tests, `TodayPage`, and `RestorationQueuePage.test.tsx` (suite failure). Known migrations: the two `webstore` `Rename index` lines.

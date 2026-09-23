# R-001 result · Buying: fees, shipping formula, Costco

**Status:** RED

Snapshot `2f9d7397` (`refs/runner/R-001`). Compare-to `ecc60707`. Logs: `workspace/runner/R-001/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py | 3 failed, 210 passed, 50 subtests passed (165.25s) | 3 | 0 | 0 |
| vitest | 9 failed, 1155 passed (1164); 6 failed files, 181 passed (187); 1 failed suite (91.62s) | 0 | 10 | 0 |
| tsc | exit 0, empty log | 0 | 0 | 0 |
| migrations-check | 2 operation lines, exit 1 | 0 | 2 | 0 |

## NEW

1. `apps/buying/tests/test_manifest_pull.py::PullJobTests::test_deadline_requeues_and_resume_finishes_the_same_list` — log `1-py.log`
   - `AssertionError: Lists differ: [] != [55, 56]`
   - Passes at `ecc60707`: `1 passed in 61.96s` (`compare-1-py.log`).

2. `apps/buying/tests/test_shipping_quote.py::ValuationPrecedenceTests::test_override_beats_the_quote` — log `1-py.log`
   - `AssertionError: {'fee[47 chars]None, 'shipping_source': 'override', 'shipping_estimate': None} != {'fee[47 chars]None, 'shipping_source': 'override'}`
   - `apps/buying/tests/test_shipping_quote.py` is not in the tree at `ecc60707`. Combined compare exited 4: `ERROR: file or directory not found: apps/buying/tests/test_shipping_quote.py::ValuationPrecedenceTests::test_override_beats_the_quote`. That log was overwritten by the manifest re-run.

3. `apps/buying/tests/test_shipping_quote.py::ShippingFormulaTests::test_ensure_origin_miles_looks_up_only_new_cities` — log `1-py.log`
   - `django.db.utils.IntegrityError: duplicate key value violates unique constraint "buying_shippingorigin_slug_key"`
   - Same absent file at `ecc60707`.

## Baseline

Nothing appended.

## Now passing

None. Every baseline vitest key in this run failed again. This pytest selection does not include the baseline py keys.

## Expect

- `apps/buying/tests/test_signed_in_sellers.py` and `apps/inventory/tests/test_restoration_history_forget.py` are not in the FAILED list.
- `test_shipping_quote.py` did not pass (the two NEW keys above). The rest of that file is in the 210 passed.
- Vitest files not in the six failed files, so these passed: `src/utils/buyingCostNotes.test.ts`, `src/utils/auctionMaxBid.test.ts`, `src/pages/admin/settings/settingsRegistry.test.ts`.
- No test over 30s. A second pytest of the same targets with `--durations-min=30` (`1-py-durations.log`, 108.71s) printed no slowest-durations section. Vitest's printed test times are all under 3s.
- No live B-Stock or Google call found in the buying tests: `test_manifest_pull.py` patches `scraper.requests.request`; `test_shipping_quote.py` patches `lookup_driving_miles` or `_http_post_json` / `_maps_api_key`. The logs have no connection error to those hosts.

Known vitest keys (all failed again): the three `ShiftHeroCard` tests, `TodayPhone`, `noDashes`, the three `ListingStudioPage` tests, `TodayPage`, and `RestorationQueuePage.test.tsx` (suite error `EMFILE: too many open files`). Known migrations: the two `webstore` `Rename index` lines.

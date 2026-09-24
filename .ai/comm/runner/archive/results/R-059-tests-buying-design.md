# R-059 · Tests: Buying Phases 4 to 6 and the new auction pages
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 16:15 · **Finished:** 2026-09-24 16:28 · **Status:** done · **RED**

Snapshot `a8fc4220` (`refs/runner/R-059`). Compare-to `f6fd6051` (v2.103.0). Logs: `workspace/runner/R-059/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 7 failed, 1202 passed, 197 files (6 failed), exit 1 | 3 | 4 tests + RestorationQueuePage file | none |
| tsc | exit 2 | 1 | 0 | — |
| py: apps/buying apps/inventory | 133 failed, 824 passed, 56 subtests passed, 509s, exit 1 | 51 (all in apps/buying) | inventory baseline (ai cleanup, intake, preprocessing, plus 5 SUBFAILED on the status-table test) | none |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

`slotCNavLayout.test.ts` and `TodayPage.test.tsx` are not in the vitest failure list. `auctionMaxBid.test.ts`, `ReportCardsPage.test.tsx` and `RoutinesNag.test.tsx` are not either.

## NEW failures

These buying test modules are not on `f6fd6051`. `test_manifest_pull.py::PullOneAuctionTests::test_success_saves_rows_maps_and_values` is on that commit and **passed** there (`compare-1-py.log`, 1 passed). `tsc` on that commit exits 0 (`compare-2-tsc.log`). The three vitest files are not on that commit.

**tsc**

- `src/pages/buying/WishListPage.tsx` TS2322: `Type '({ id, on }: { id: number; on: boolean; }) => Promise<void> | Promise<BuyingWatchlistEntry>' is not assignable to type 'MutationFunction<void, { id: number; on: boolean; }>'.` (`2-tsc.log`)

**vitest**

- `src/components/buying/ManifestAnalysisCard.test.tsx > ManifestAnalysisCard > filters rows by a hazard, box 1 of N first` — `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "High value · 2"` (`1-vitest.log`)
- `src/pages/buying/WishListPage.test.tsx > Today's best > ranks by profit and adds the ones over max on request` — `TestingLibraryElementError: Unable to find an accessible element with the role "checkbox" and name "Show ones over max"` (`1-vitest.log`)
- `src/components/buying/decision/AuctionDecision.test.tsx > auction decision panel > works out landed cost and profit at any bid` — `TestingLibraryElementError: Unable to find an element with the text: /Landed \$2,520/` (`1-vitest.log`)

**pytest, one shared error**

`psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint "buying_marketplace_slug_key"` (`3-py.log`) on every test in:

- `apps/buying/tests/test_buying_nags.py` (4)
- `apps/buying/tests/test_close_model_fit.py` (3)
- `apps/buying/tests/test_decision.py` (16)
- `apps/buying/tests/test_wishlist.py` (10)
- `apps/buying/tests/test_won_to_po.py` (12)

`psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint "buying_categorystats_category_key"` on all 6 tests in `apps/buying/tests/test_manifest_analysis.py::MatchAndValueTests`.

**pytest, different error**

- `apps/buying/tests/test_manifest_pull.py::PullOneAuctionTests::test_success_saves_rows_maps_and_values` — `AssertionError: 20.0 != 19.98 within 2 places (0.019999999999999574 difference)` (`3-py.log`). Passes on `f6fd6051`.

## Baseline

Nothing added. The marketplace-slug and category-stats failures are new tests, not pre-existing keys.

## Now passing

None.

# R-037 · Full pre-ship test run (POS and processing must be clean)
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 08:27 · **Finished:** 2026-09-24 09:05 · **Status:** done · **GREEN**

Snapshot `241ff2ee` (`refs/runner/R-037`). Compare-to `9e969a42`. Logs: `workspace/runner/R-037/`.

## POS (known only)

Two failures, both already in the baseline. Same error on both:

`TypeError: can't multiply sequence by non-int of type 'decimal.Decimal'` at `apps/pos/models.py:309` (`1-py.log`).

- `apps/pos/tests/test_delivery_days_api.py::DeliveryDaysAPITests::test_create_delivery_from_past_cart_is_audited`
- `apps/pos/tests/test_delivery_run.py::DeliveryRunAPITests::test_line_items_and_optional_scan_verify`

No other `apps/pos` failure.

## Processing, check-in, preprocessing (known only)

Every failure in that area is already in the baseline: the AI-cleanup batch suite, intake undo, preprocessing redesign (including `test_processing_check_in_works_with_fast_path_productless_items`), and the five subtests of `test_preprocessing_status_completed_step_table_per_preprocess_status`. No new processing failure.

## Commands

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: pos inventory buying core webstore accounts labels floorplan | 86 failed, 1513 passed, 57 subtests passed, 906.64s | none | 81 nodes + 1 confirmed pre-existing | none |
| py: . | 117 failed, 1684 passed, 57 subtests passed, 1011.19s | none | 113 nodes | none |
| vitest | 9 failed, 1156 passed (1165); 6 files failed, 181 passed (187); 92.05s | none | 10 keys | none |
| tsc | exit 0 | none | none | — |
| migrations-check | exit 1 | none | 2 webstore rename-index lines | — |

The 86 and 117 counts include 5 `SUBFAILED` rows of one known node.

## Baseline added

`test_clear_history_clears_notes_and_superseded_not_actions` is not a POS or processing test. It failed in the first pytest (`AssertionError: 3 != 4` at `test_restoration_history_forget.py:625`, `1-py.log`) and failed the same way at compare-to (`compare-restoration.log`, 1 failed in 58.47s). It passed inside `py: .`. Pre-existing, appended to `baseline.md` as `(confirmed R-037 @ 9e969a42)`.

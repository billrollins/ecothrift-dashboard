# R-067 · Tests: full pre-ship run for v2.104.0
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 17:37 · **Finished:** 2026-09-24 18:12 · **Status:** done · **GREEN**

Snapshot `fdc11362` (`refs/runner/R-067`). Compare-to `f6fd6051` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-067/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: pos inventory buying core webstore accounts labels floorplan | 85 failed, 1597 passed, 78 subtests passed, 970.78s, exit 1 | 0 | 80 nodes + 5 status-table SUBFAILED | — |
| py: . | 90 failed, 1802 passed, 78 subtests passed, 1030.08s, exit 1 | 0 | 85 nodes + 5 status-table SUBFAILED | — |
| vitest | 4 failed, 1205 passed, exit 1 | 0 | 4 tests + RestorationQueuePage file | — |
| tsc | exit 0 | 0 | 0 | — |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## POS and processing

No NEW failure in `apps/pos`. The only POS failures are the two baseline delivery tests: `test_create_delivery_from_past_cart_is_audited` and `test_line_items_and_optional_scan_verify`.

No NEW failure in inventory processing, preprocessing, or receiving. Those failures are the baseline keys.

The two R-066 `test_won_to_po.py` failures (`'3000.00' != '3000'`) are not in this run's failure list.

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

None.

# R-035 · Tests: sweep price snapshots
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 08:03 · **Finished:** 2026-09-24 08:06 · **Status:** done · **GREEN**

Snapshot `111cff7f` (`refs/runner/R-035`). Compare-to `9e969a42` (not re-run: no failures). Logs: `workspace/runner/R-035/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/buying | 217 passed, 50 subtests, 66.67s, exit 0 | none | none | — |
| migrations-check | exit 1 | none | 2 webstore rename-index lines | — |

`test_sweep_records_price_history_only_when_it_moves` is in the suite that passed, along with `test_sweep_insert_and_update_still_work` and `test_sweep_saves_and_keeps_pallets_and_origin`.

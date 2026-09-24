> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-035 · Tests: sweep price snapshots

- **Type:** test · **Snapshot ref:** `refs/runner/R-035` (`111cff7f`) · **Compare-to:** `9e969a42`
- **What changed (on top of R-032):** `apps/buying/services/sweep_upsert.py` now reads the old price and bid count before each upsert, and bulk-creates an `AuctionSnapshot` when they change. There is a new test in `test_manifest_pull.py`.

## Run
1. `py: apps/buying`
2. `migrations-check`

## Expect
`test_sweep_records_price_history_only_when_it_moves` passes, and the sweep and shipping-quote upsert tests are unchanged.

> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-069 · Tests: seller revenue factors (after v2.104.0)

- **Type:** test · **Snapshot ref:** `refs/runner/R-069` (`fc577c6f`) · **Compare-to:** `2a43ee2a` (v2.104.0)
- **What changed since v2.104.0:**
  - new `apps/buying/services/seller_factor.py` and the command `fit_seller_factors`;
  - `valuation.recompute_auction_full` multiplies revenue by `seller_factor(auction)`, which is 1.0 unless saved;
  - the decision `landed` adds `seller_factor` and `seller_factor_trucks`, and `AuctionSideRail` mentions them;
  - new test `apps/buying/tests/test_seller_factor.py`.
  - `close_model_fit.MIN_BUMP_N` is now 50 (was 15, R-063); `test_close_model_fit.py` builds that many auctions.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/buying`

## Expect
- `tsc` exits 0.
- vitest and `apps/buying` have 0 NEW failures against v2.104.0 (R-067 lists the baseline).
- For any failure, give the test id and its first error line.

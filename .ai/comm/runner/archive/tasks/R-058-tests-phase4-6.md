> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-058 · Tests: Buying Phases 4 to 6 (manifest analysis; price target and wish list; won to PO and report card)

- **Type:** test · **Snapshot ref:** `refs/runner/R-058` (`5438bbdb`) · **Compare-to:** `f6fd6051` (v2.103.0, production)
- **Supersedes R-057** (same Phase 4 and 5 code plus Phase 6).
- **What changed** (see R-057's task for Phases 4 and 5):
  - **Phase 6:** migration `buying.0034_won_to_po` (`Auction.purchase_order`, `Outcome.prediction`); `apps/buying/services/won_to_po.py` (`mark_won` creates an inventory PO in `ordered` and re-uploads the manifest through `inventory.services.intake_test_reset.upload_manifest_from_bytes`; `mark_lost`; `report_card`; `calibration`; `refresh_calibration`); `AuctionViewSet` actions `won` and `lost`; detail fields `purchase_order`, `purchase_order_number`, `outcome`, `report_card`; wishlist response adds `report_cards`; `valuation.recompute_auction_full` multiplies revenue by `price_target.get_revenue_calibration()` (1.0 until set); `compute_daily_category_stats` calls `refresh_calibration`.
  - Frontend: `AuctionOutcomeCard.tsx` (+ test) on the auction page; types and API calls.
  - New tests: `apps/buying/tests/test_won_to_po.py`, `test_manifest_analysis.py`, `test_wishlist.py`; frontend `AuctionOutcomeCard.test.tsx`, `ManifestAnalysisCard.test.tsx`, `WishListPage.test.tsx`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/buying apps/inventory`
4. `migrations-check`

## Expect
- `tsc` exit 0; 0 NEW vitest failures; the three new buying frontend tests pass.
- `apps/buying`: the three new test files pass; 0 NEW. `apps/inventory`: 0 NEW (Phase 6 creates POs and calls the manifest upload service; watch PO, manifest and preprocessing tests). Give the first error line of any failure in either app.
- `migrations-check`: nothing new for `buying` (the 2 known webstore lines only).

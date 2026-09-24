> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-057 · Tests: Buying Phases 4 and 5 (manifest analysis; price target and wish list)

- **Type:** test · **Snapshot ref:** `refs/runner/R-057` (`cf156f63`) · **Compare-to:** `f6fd6051` (v2.103.0, production)
- **Supersedes R-056** (same Phase 4 code plus Phase 5).
- **What changed:**
  - **Phase 4:** migration `buying.0032_manifest_analysis`; `apps/buying/services/manifest_analysis.py`; command `analyze_manifests`; `valuation.recompute_auction_full` runs the analysis when the manifest changed and uses `analysis_revenue`; `manifest_rows` gets `hazard` / `matched` filters, `line_value` ordering and `product_sales`; frontend `ManifestAnalysisCard`, `manifestHazards.ts`, auction page columns.
  - **Phase 5:** migration `buying.0033_price_target` (`Auction.price_target`, `expected_close`); `services/price_target.py`; both recomputes set them; `services/wishlist.py` + `GET /api/buying/wishlist/`; frontend `WishListPage` at `/buying/wishlist`, nav item `wishlist` (Buying group, first), `useBuyingWishlist`, likely close in the max-bid tooltip.
  - New tests: `apps/buying/tests/test_manifest_analysis.py`, `apps/buying/tests/test_wishlist.py`, `ManifestAnalysisCard.test.tsx`, `WishListPage.test.tsx`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/buying`
4. `migrations-check`

## Expect
- `tsc` exit 0; 0 NEW vitest failures; the two new frontend test files pass. Any failure in a nav test (a new Buying item) or `slotCNavLayout.test.ts`: list it.
- `test_manifest_analysis.py` and `test_wishlist.py` all pass; 0 NEW in `apps/buying`. Watch `test_valuation.py` / `test_valuation_benchmarks.py`: recompute now also sets `price_target` / `expected_close` and may analyze manifests; report any failure with its first error line.
- `migrations-check`: nothing new for `buying` (the 2 known webstore lines only).

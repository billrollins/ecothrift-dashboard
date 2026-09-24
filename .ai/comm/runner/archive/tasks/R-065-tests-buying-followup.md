> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-065 · Tests: retest R-059's RED, with the fixes and the changes after its snapshot

- **Type:** test · **Snapshot ref:** `refs/runner/R-065` (`1e01d208`) · **Compare-to:** `f6fd6051` (v2.103.0, production)
- **What changed since R-059's snapshot (`1e01d208`):**
  - **Retail mismatch rail.** In `apps/buying/services/manifest_analysis.py`, `_retail_mismatch` scales a truck's line values back to the listing when its manifest retail is more than 3× the listing's (`RETAIL_MISMATCH`), and stores `summary['retail_mismatch']`. `ManifestAnalysisCard` shows it. In `decision.py`, the `retail` falls back to the listing's when the manifest is flagged.
  - **Fixes for R-059's 55 NEW failures:**
    - pytest `UniqueViolation` (`buying_marketplace_slug_key`, `buying_categorystats_category_key`): the new buying tests now `update_or_create` the marketplaces and category stats that migrations seed.
    - `test_manifest_pull.py::PullOneAuctionTests::test_success_saves_rows_maps_and_values` (20.0 != 19.98): the analysis now sums exact unit values and rounds only when it stores them.
    - tsc TS2322 in `WishListPage.tsx`: the watch mutation now returns nothing.
    - vitest:
      - `WishListPage.test.tsx` uses role `switch` (MUI v7);
      - `ManifestAnalysisCard.tsx` hazard tooltips use `describeChild`, so a chip's name is its label;
      - the what-if and max-bid inputs carry their `aria-label` on the input (`slotProps.htmlInput`).
- **New or changed tests:** in `apps/buying/tests/test_manifest_analysis.py`, `test_a_manifest_far_over_the_listing_is_scaled_back_and_flagged`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/buying apps/inventory`
4. `migrations-check`

## Expect
- `tsc` exits 0.
- vitest, `apps/buying` and `apps/inventory` have 0 NEW failures (R-059 listed the known inventory and vitest baseline).
- `migrations-check` shows only the 2 known webstore lines.
- For any failure, give the test id and its first error line.

> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-059 · Tests: Buying Phases 4 to 6 and the new auction pages (decision panel, Today's best)

- **Type:** test · **Snapshot ref:** `refs/runner/R-059` (`a8fc4220`) · **Compare-to:** `f6fd6051` (v2.103.0, production)
- **Supersedes R-058.** It holds the same Phase 4–6 code (see R-057 and R-058) plus the design pass below.
- **What changed since R-058:**
  - **Backend:**
    - Migration `buying.0035_buyer_max_notes` adds `Auction.max_bid` and `Auction.buyer_notes`.
    - New `apps/buying/services/decision.py`: the auction page's verdict, bid tiers, need, hazards, profit range, landed cost, similar lots and seller.
    - `wishlist.py` v2: `build_wishlist(include_over, rank, category)` returns a dict, and there is a new `buying_strip()`.
    - `price_target.handling_costs` adds labor and disposal. The Assumptions settings for them default to 0.
    - `AuctionViewSet` gains `decision` (GET) and `buyer` (PATCH).
    - `manifest_rows` gains `hazard=any` and `matched=0`.
    - The analysis summary gains `flagged_lines` and `top_lines_value_pct`.
    - The detail serializer gains `handling_cost`.
  - **Frontend:**
    - `components/buying/decision/*`: header, KPI cards, side rail and score badge, with `AuctionDecision.test.tsx`.
    - `WishListPage.tsx` is rewritten as "Today's best".
    - `AuctionDetailPage.tsx` uses the decision panel and has the manifest tabs (All / Flagged / Matched / No match) and the Sells in column.
    - `ManifestAnalysisCard` gets the top-10 value badge and loses the matched chip.
    - `auctionMaxBid.ts` counts `handling_cost`.
  - **Buyer's nags:**
    - new `apps/buying/services/buying_nags.py` and `GET /api/buying/nags/` (superusers only);
    - frontend `useBuyingNags`, `components/buying/BuyingNagCards.tsx`;
    - `nagSummary` takes an optional 4th argument, and `RoutinesNag` and `useTodayModel` count the buying nags.
  - **Report cards:**
    - `won_to_po.report_cards()` and `GET /api/buying/report-cards/`;
    - new `pages/buying/ReportCardsPage.tsx`, the route `/buying/report-cards`, and the nav item `reportCards` in the Buying group.
  - **From the R-052 and R-053 recon:**
    - `manifest_analysis`: a near match now needs 0.7 or more, the sizes in the two titles must agree (`sizes`, `sizes_conflict`), and a seller's hedge ("may be missing pieces") no longer counts as missing pieces.
    - `price_target.DEFAULT_CLOSE_MODEL` has the new seller ratios, a bump of 1.00, and seller × condition `cells`.
    - New `services/close_model_fit.py` and the command `fit_close_model`.
  - **Shortlist:** `WishListPage` has a "Your shortlist" panel (watched live lots, from `fetchBuyingWatchlist`), and the Report cards strip tile links to its page. The list serializer adds `max_bid`.
  - **Assumptions:**
    - data migration `buying.0036_seed_price_target_assumptions` seeds `buying_profit_factor` (2.0), `buying_labor_per_item` (0) and `buying_disposal_per_pallet` (0);
    - `settingsRegistry.ts` and `AssumptionsPanel.tsx` list them, and `settingsRegistry.test.ts` is updated.
  - **Pull runner:** `BstockPullRunner` shows "Open Today's best" after a pull with results. `manifest_pull.shortlist_queryset` orders lots over their max after the rest, with a new test in `test_manifest_pull.py`.
  - **Today's plan:** a `PlanCard` on `WishListPage` shows the 2 best lots ending within a day, and `buying_strip()` adds `won_today`. Near lookups in `match_rows` now go to the titles with the most retail first.
  - **Need column:** `manifest_rows` adds `need_level` per row (from `CategoryStats`), and the manifest grid shows it.
  - **Auctions list:** `AuctionListDesktop` has a Max column (`max_bid`, else `price_target`).
  - **Units fill-in:** `price_target.handling_costs` returns `units_basis`, and `units_per_pallet()` (a raw-SQL median, cached) fills in units from pallets, and pallets from units for disposal. The decision `landed` adds `labor_units`, `labor_units_basis`, `disposal_pallets` and `disposal_pallets_basis`.
  - **Decision panel extras:** "Use the model's" clears the buyer's max. The side rail has "What if I win at" (`landedAt`), the decision `landed` adds `ship_rate`, and the Today's best table shows why and why not as a tooltip.
  - **Recovery fill-in:** new `services/recovery.py`. `valuation._recovery_rate_for_category` and `manifest_analysis._category_rate` use it, and the decision `landed` adds `filled_categories` and `store_rate`. This changes valuation for every auction with a zero-rate category; watch the valuation tests.
  - **Retail mismatch rail:** `manifest_analysis._retail_mismatch` and `RETAIL_MISMATCH`, shown on `ManifestAnalysisCard`; the decision's `retail` falls back to the listing.
  - **New or changed tests:**
    - backend: `apps/buying/tests/test_decision.py`, `test_manifest_analysis.py` and `test_wishlist.py`;
    - backend: also `test_buying_nags.py`, `test_close_model_fit.py`, a report-cards case in `test_won_to_po.py`, and the new close-model cases in `test_wishlist.py`;
    - frontend: `AuctionDecision.test.tsx`, `WishListPage.test.tsx`, `ManifestAnalysisCard.test.tsx`, `auctionMaxBid.test.ts`, `ReportCardsPage.test.tsx`, and a buying case in `RoutinesNag.test.tsx`.
- **Watch:** the nav tests (`slotCNavLayout.test.ts`), because the Buying group gained an item, and `TodayPage.test.tsx`, because Today now calls `useBuyingNags`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/buying apps/inventory`
4. `migrations-check`

## Expect
- `tsc` exits 0.
- vitest has 0 NEW failures, and all the buying frontend tests above pass.
- `apps/buying` has 0 NEW failures, and `test_decision.py`, `test_buying_nags.py`, `test_close_model_fit.py`, `test_manifest_analysis.py`, `test_wishlist.py` and `test_won_to_po.py` pass.
- `apps/inventory` has 0 NEW failures. Phase 6 creates POs and calls the manifest upload service.
- For any failure, give the test id and its first error line.
- `migrations-check` shows nothing new for `buying` (only the 2 known webstore lines).

> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-056 · Tests: Buying Phase 4 (manifest analysis, hazards, truck value v2)

- **Type:** test · **Snapshot ref:** `refs/runner/R-056` (`a87f17d9`) · **Compare-to:** `f6fd6051` (v2.103.0, production)
- **What changed:**
  - Migration `buying.0032_manifest_analysis` (new fields on `Auction` and `buying.ManifestRow`; all nullable or with defaults).
  - New `apps/buying/services/manifest_analysis.py` and command `analyze_manifests`; `valuation.recompute_auction_full` runs the analysis when the manifest changed and uses `analysis_revenue` for revenue.
  - `api_views.AuctionViewSet.manifest_rows`: `hazard` and `matched` filters, `line_value` ordering, `product_sales` per row. Serializers: row match fields; detail `manifest_analysis`, `analysis_revenue`.
  - Frontend: `ManifestAnalysisCard.tsx` (+ test), `manifestHazards.ts`, the auction page's Value / Match / Hazards columns and filters, types and API params.
  - New tests: `apps/buying/tests/test_manifest_analysis.py`, `frontend/src/components/buying/ManifestAnalysisCard.test.tsx`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/buying`
4. `migrations-check`

## Expect
- `tsc` exit 0; 0 NEW vitest failures; `ManifestAnalysisCard.test.tsx` passes.
- `apps/buying/tests/test_manifest_analysis.py` all pass; 0 NEW in `apps/buying` (watch `test_valuation.py` and `test_valuation_benchmarks.py`: revenue now comes from the analysis when a test auction has manifest lines; report any of those failures with their first error line).
- `migrations-check`: nothing new for `buying` (the 2 known webstore lines only).

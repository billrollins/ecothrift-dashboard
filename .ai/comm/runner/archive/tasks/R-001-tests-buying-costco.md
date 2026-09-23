# R-001 · test · Buying: fees, shipping formula, Costco

- **Snapshot:** `refs/runner/R-001` (`2f9d7397`, working tree on top of `ecc60707`)
- **Compare-to:** `ecc60707` (main after the ai-settings-floorplan merge)
- **Why:** everything since the merge:
  - the B-Stock fee and shipping quote;
  - the shipping distance formula (`ShippingOrigin`, `buying/0022` to `0025`);
  - Costco and other signed-in-only sellers;
  - the key-mapping timeout;
  - prune keeping outcomes;
  - the restoration test flake fix.
- **Run:**
  1. `py: apps/buying apps/inventory/tests/test_restoration_history_forget.py`
  2. `vitest`
  3. `tsc`
  4. `migrations-check`
- **Expect:**
  - These pass: `apps/buying/tests/test_shipping_quote.py`, `test_signed_in_sellers.py`, `src/utils/buyingCostNotes.test.ts`, `src/utils/auctionMaxBid.test.ts` and `settingsRegistry.test.ts`.
  - No test reaches B-Stock or Google. List any test over 30 s.
- **Result:** `results/R-001-tests-buying-costco.md`, in the test result shape from the protocol.

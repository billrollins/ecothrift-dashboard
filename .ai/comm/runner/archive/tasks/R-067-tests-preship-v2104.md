> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-067 · Tests: full pre-ship run for v2.104.0 (buying Phases 4 to 6, the new auction pages, buying nags)

- **Type:** test · **Snapshot ref:** `refs/runner/R-067` (`fdc11362`) · **Compare-to:** `f6fd6051` (v2.103.0, production)
- **Why:** This is the ship gate. The owner ships only when there is zero chance of breaking POS or processing in production.
- **What is in it:** everything R-059, R-065 and R-066 tested, plus R-066's last fix: `test_won_to_po.py` expects `'3000.00'`, the stored form, in the prediction snapshot.
- **Touches outside `apps/buying`:**
  - `apps/inventory`: `ManifestRow.matched_product` and `Auction.purchase_order` are foreign keys from buying tables with `SET_NULL`; won-to-PO uses the PO manifest upload service; no inventory code changed.
  - Frontend:
    - `components/routines/RoutinesNag.tsx`, `nagSummary.ts` and `today/useTodayModel.ts` count the buying nags;
    - `pages/routines/runners/BstockPullRunner.tsx`;
    - the Admin → Assumptions registry;
    - the nav catalog (Report cards).

## Run
1. `py: apps/pos apps/inventory apps/buying apps/core apps/webstore apps/accounts apps/labels apps/floorplan`
2. `py: .` (everything else; skip nothing)
3. `vitest`
4. `tsc`
5. `migrations-check`

## Expect
- GREEN: no NEW failures in any step, measured against the known baseline (R-065 and R-066 list the current vitest and inventory keys).
- Say plainly whether any `apps/pos` or processing test (`apps/inventory` processing, preprocessing, receiving) is NEW. Give the test id and the first error line of every NEW failure.
- `migrations-check`: only the 2 known webstore lines.

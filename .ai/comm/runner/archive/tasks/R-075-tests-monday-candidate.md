> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-075 · Tests: the Monday candidate after the merge (scanner code, 10% floor, /scan passthrough, POS line-price fix)

- **Type:** test · **Snapshot ref:** `refs/runner/R-075` (`ef679c16`) · **Compare-to:** `fd7eb327` (v2.107.0, production; the `thrift_scanner` thread's push)
- **Why:** R-074 was GREEN on `be51f372`. Since then:
  1. **The merge:** the working tree was merged over `origin/main` (`fd7eb327`, the scanner mock: frontend only).
  2. **The reward floor** is now 10% of the tag, with no cost: `apps/thriftplus/services/rewards.py`, migrations `thriftplus.0003` and `0004` edited in place (never shipped), and tests updated. `services/trip.py` is new: pure math, not yet called.
  3. **`/scan` passthrough:** `PublicSiteMiddleware` passes `/scan` through on the public hosts. New test `apps/core/tests/test_public_passthrough.py`.
  4. **POS fix:** `CartLine.save()` now turns `unit_price` into an exact Decimal first. A price edited at the register arrives from JSON as a float, and float × Decimal raised TypeError. New test `test_patch_line_price_with_cents_from_json` in `apps/pos/tests/test_cart_totals.py`.
     - The same root cause broke the 2 baseline delivery tests (`test_delivery_days_api.py::…::test_create_delivery_from_past_cart_is_audited`, `test_delivery_run.py::…::test_line_items_and_optional_scan_verify`). They should now pass.
     - **If they pass, prune both from the baseline.**

## Run
1. `vitest`
2. `tsc`
3. `py: apps/thriftplus apps/core apps/pos apps/inventory/tests/test_purchase_order_financials.py apps/webstore/tests/test_holds_hard_controls.py`
4. `migrations-check`

## Expect
- `tsc` exits 0, including the merged scanner code (`frontend/src/pages/thriftplus/scanner/`, `api/thriftPlusMock.ts`).
- vitest: 0 NEW failures. The merged scanner tests (`api/thriftPlusMock.test.ts` and any in `pages/thriftplus/scanner/`) pass.
- pytest: 0 NEW failures.
  - **POS:** say plainly whether any `apps/pos` failure is NEW. The 2 delivery tests should move to "now passing".
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines.

> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-076 · Tests: Thrift+ at the register (Phase 3: member price, ledgers, 18+, receipts, re-ring, returns), plus the npm install for the scanner's packages

- **Type:** test · **Snapshot ref:** `refs/runner/R-076` (`18ef1d59`) · **Compare-to:** `refs/runner/R-075` (`ef679c16`, GREEN; the Monday ship tree)
- **First, a chore:** run `npm ci` (or `npm install` if `ci` fails) in the frontend of the checkout you test in. The scanner thread added `barcode-detector` and `zxing-wasm`, and R-075's `tsc` and the scanner page test failed only because they were not installed.
  - If both then pass, **prune the two baseline entries R-075 added**: `ThriftPlusScannerPage.test.tsx` and the `TS2307 barcode-detector/ponyfill` line.
- **What changed since R-075** (none of it touches a sale while Thrift+ is dark: every step checks a live gate first):
  - **POS** (`apps/pos`):
    - `CartLine.thrift_savings` is taken off `line_total` in `save()`, and `Cart.thrift_credit` is new (migration `pos.0033_thrift_plus_fields`);
    - `Cart.recalculate()` calls `thriftplus.services.register.sync_if_live`;
    - `add-item` and `add-resale-copy` check 18+;
    - `complete()` is now one `transaction.atomic`, charges `total - thrift_credit`, and writes the Thrift+ ledger when Thrift+ applies;
    - `void()` reverses the ledger;
    - `card-preview` uses the amount due;
    - `cart_savings` gets a "Thrift+ rewards" bucket;
    - `CartSerializer.thrift_plus` and `thrift_credit`, and `CartLineSerializer.thrift_savings`.
  - **Thrift+** (`apps/thriftplus`):
    - models `CartMember`, `LedgerEntry`, `RestrictedProduct`, `SalePhoto`, `ReturnRecord` (`0005`, `0006` seeds, `0007`);
    - services `trip.py`, `ledger.py`, `register.py`, `returns.py`;
    - API `register/`, `returns/`, `restricted/`.
  - **Frontend:**
    - `pages/pos/TerminalPage.tsx`: card scan, Thrift+ panel, totals, amount due, re-ring, the return dialog;
    - new `components/pos/ThriftPlusPanel.tsx` and `ThriftPlusReturnDialog.tsx`, `api/thriftplusRegister.api.ts`, `utils/thriftPlusCard.ts`;
    - `utils/posReceipt.ts` (the `thrift_plus` block);
    - `pages/thriftplus/RegisterTab.tsx`, and `types/pos.types.ts`.
  - **Print server:** `printserver/services/receipt_printer.py` (`_thrift_plus_rows`). Not run by these commands; see step 5.
- **New tests:**
  - `apps/thriftplus/tests/test_register.py`: trip math, ledger, dark vs live, member price, complete and void, credit, 18+, sales not stacking, re-ring, returns;
  - `frontend/src/components/pos/ThriftPlusPanel.test.tsx`, `frontend/src/utils/thriftPlusCard.test.ts`;
  - Thrift+ cases added to `frontend/src/utils/posReceipt.test.ts`.

## Run
1. `npm ci` in the frontend (chore above)
2. `vitest`
3. `tsc`
4. `py: apps/thriftplus apps/pos apps/core apps/webstore apps/inventory/tests/test_purchase_order_financials.py apps/inventory/tests/test_processing_transforms.py`
5. `py (printserver)`: from `printserver/`, `python -c "from services.receipt_printer import format_receipt, format_receipt_text; d={'items':[], 'subtotal':1,'tax':0,'total':1,'payment_method':'cash','thrift_plus':{'member':'Ana','card_last4':'0008','lines':[{'name':'Lamp','tag_price':90,'member_price':87,'reward':13}],'reward_total':13,'to_cover':10,'savings':3,'to_bank':0,'cover_covered':10,'cover_amount':10,'cover_month':'2026-10','banked':0,'credit':0}}; format_receipt(d); print(format_receipt_text(d))"` with the printserver's own requirements. Paste the printed text.
6. `migrations-check`

## Expect
- `tsc` exits 0 after the npm install.
- vitest and pytest: 0 NEW failures against R-075.
  - **POS:** say plainly whether any `apps/pos` failure is NEW. R-075 had none at all.
- The printserver text shows the THRIFT+ MEMBER block with the lamp line.
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines: no `pos` or `thriftplus` operations.

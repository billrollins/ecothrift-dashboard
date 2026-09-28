> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-072 · Tests: Thrift+ members and cards (thrift_plus_rewards Phase 1), plus the R-071 fixes and everything since

- **Type:** test · **Snapshot ref:** `refs/runner/R-072` (`3d60eb57`) · **Compare-to:** `2e996c56` (v2.105.1, production)
- **What changed since R-071 (`3d60eb57`):**
  - **New app** `apps/thriftplus`, added to `INSTALLED_APPS` and routed at `/api/thriftplus/`:
    - models Account, Person, Card, CardBatch and Event;
    - migrations `0001` and `0002` (`0002` seeds the `thrift_plus_enabled` AppSetting, off);
    - services `cards.py` (Luhn codes, batches), `members.py` (rules) and `card_pdf.py` (reportlab card backs);
    - views and serializers.
  - **Frontend:**
    - `pages/thriftplus/` (`ThriftPlusPage`, `MembersTab` and `CardBatchesTab`, plus a test), `api/thriftplus.api.ts` and `types/thriftplus.types.ts`;
    - the route `/thrift-plus` (SuperAdminRoute);
    - the nav item `thriftPlus` in the Cashier group.
  - **Nav test fix:** the second Admin expectation in `slotCNavLayout.test.ts` now includes `superRequests`.
  - **Buying (R-068):** `decision._similar` scales similar closes by retail (`basis` = scaled / raw / model), with a new test in `apps/buying/tests/test_decision.py`; the side rail notes it.
  - **Fixes for R-071's NEW failures:**
    - `approval_requests.run()` no longer calls `close_old_connections()`; only the background thread wrapper `_thread_main` does. That caused the "connection already closed" errors in tests.
    - `ApprovalRequestViewSet.get_queryset` slices only for `list`. The slice made every detail action a 404.
    - `RequestsPage.tsx` shows "-" instead of an em dash (the `noDashes` rule).
    - The nav test fix is listed above.
- **New tests:**
  - backend: `apps/thriftplus/tests/test_members.py`;
  - frontend: `frontend/src/pages/thriftplus/ThriftPlusPage.test.tsx`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/thriftplus apps/core apps/inventory apps/accounts apps/pos apps/buying`
4. `migrations-check`

## Expect
- `tsc` exits 0.
- vitest and pytest have 0 NEW failures against v2.105.1. POS must have 0 NEW failures; its known baseline is the two delivery tests in R-067.
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines. The `thriftplus` migrations are committed in the tree.

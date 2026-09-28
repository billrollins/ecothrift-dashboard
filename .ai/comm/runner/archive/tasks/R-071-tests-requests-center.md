> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-071 · Tests: Superuser → Requests (data_platform Phase 1)

- **Type:** test · **Snapshot ref:** `refs/runner/R-071` (`fe8c0f88`) · **Compare-to:** `2e996c56` (v2.105.1, production)
- **What changed:**
  - **New model and service:** `core.ApprovalRequest` (migration `core.0008_approval_request`) and `apps/core/services/approval_requests.py` (registry, stage, approve, run in a background thread, resume, undo).
  - **API:** `ApprovalRequestViewSet` at `/api/core/requests/`, superuser only.
  - **Command:** `stage_request`.
  - **Inventory kinds** in `apps/inventory/approval_kinds.py`, registered in `InventoryConfig.ready`.
  - **Loader:** the shared, streaming `services/proposal_load.py`, used by the rewritten `load_profile_proposals` command.
  - **Data:** backfill files in `apps/inventory/data/backfill/*.jsonl.gz`.
  - **Frontend:** `pages/admin/RequestsPage.tsx` (+ test), `api/approvalRequests.api.ts`, the `/admin/requests` route, and a nav item `superRequests` in the Admin group (the `slotCNavLayout.test.ts` expectation is updated).
  - **New tests:** `apps/core/tests/test_approval_requests.py`, `apps/inventory/tests/test_approval_kinds.py`, `frontend/src/pages/admin/RequestsPage.test.tsx`.
- **Watch:** anything that imports `apps.inventory` at app load (the new `ready()` import), and the proposal and product-review tests (the `load_profile_proposals` command changed).

## Run
1. `vitest`
2. `tsc`
3. `py: apps/core apps/inventory apps/buying`
4. `migrations-check`

## Expect
- `tsc` exits 0.
- vitest and pytest have 0 NEW failures against v2.105.1. R-067 lists the known baseline: 4 vitest tests and the RestorationQueuePage file, plus the inventory keys and 5 status-table SUBFAILED.
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines (`core.0008` is committed).

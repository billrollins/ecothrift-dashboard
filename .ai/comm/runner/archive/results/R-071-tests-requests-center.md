# R-071 · Tests: Superuser → Requests (data_platform Phase 1)
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 14:15 · **Finished:** 2026-09-25 14:28 · **Status:** done · **RED**

Snapshot `fe8c0f88` (`refs/runner/R-071`). Compare-to `2e996c56` (v2.105.1). Logs: `workspace/runner/R-071/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 10 failed, 1200 passed (1210), 5 files failed, exit 1, 106.60s | 1 | 4 tests + RestorationQueuePage file + 5 myWork | 6 baseline keys |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/core apps/inventory apps/buying | 91 failed, 953 passed, 71 subtests passed, 548.79s, exit 1 | 9 | 77 nodes + 5 status-table SUBFAILED | 1 |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

No buying `FAILED` lines. No collection error from the inventory `ready()` import. No new failures in the proposal or product-review tests.

## NEW failures

### vitest (`1-vitest.log`)

Passes at `2e996c56` (`5-vitest-compare.log`: `slotCNavLayout.test.ts` passed, 35 tests).

- `src/navigation/slotCNavLayout.test.ts > Command Center placement > sits in Cashiers behind the divider, and in Admin after Routines` — `AssertionError: expected [ 'users', 'departments', …(6) ] to deeply equal [ 'users', 'departments', …(5) ]`

The received list adds `superRequests`.

### py (`3-py.log`)

These files are absent at `2e996c56` (`6-py-compare.log`: `ERROR: file or directory not found: apps/core/tests/test_approval_requests.py`).

- `apps/core/tests/test_approval_requests.py::ApprovalRequestFlowTests::test_a_failed_run_resumes_from_its_cursor` — `E           psycopg2.InterfaceError: connection already closed`
- `apps/core/tests/test_approval_requests.py::ApprovalRequestFlowTests::test_a_live_run_is_not_started_twice_but_a_stale_one_is` — `E           psycopg2.InterfaceError: connection already closed`
- `apps/core/tests/test_approval_requests.py::ApprovalRequestFlowTests::test_approve_then_run_applies_and_logs` — `E           psycopg2.InterfaceError: connection already closed`
- `apps/core/tests/test_approval_requests.py::ApprovalRequestFlowTests::test_reject_and_undo_rules` — `E           psycopg2.InterfaceError: connection already closed`
- `apps/core/tests/test_approval_requests.py::ApprovalRequestFlowTests::test_staging_builds_the_preview_and_changes_nothing` — `E           psycopg2.InterfaceError: connection already closed`
- `apps/core/tests/test_approval_requests.py::ApprovalRequestApiTests::test_list_approve_and_reject` — `E       KeyError: 'status'`
- `apps/inventory/tests/test_approval_kinds.py::InventoryKindTests::test_brand_aliases_add_only_the_missing_ones_and_undo` — `E           psycopg2.InterfaceError: connection already closed`
- `apps/inventory/tests/test_approval_kinds.py::InventoryKindTests::test_duplicate_merges_follow_the_frozen_plan_and_undo` — `E           psycopg2.InterfaceError: connection already closed`
- `apps/inventory/tests/test_approval_kinds.py::InventoryKindTests::test_load_then_apply_proposals_and_undo_both` — `E           psycopg2.InterfaceError: connection already closed`

## migrations-check

Only the two known webstore lines. No `core` operations. `core.0008` is not proposed.

```
Migrations for 'webstore':
  ~ Rename index webstore_an_is_acti_4b2c2c_idx on announcement to webstore_an_is_acti_a90e0e_idx
  ~ Rename index webstore_st_is_acti_8c1a1a_idx on storehoursoverride to webstore_st_is_acti_8afd4f_idx
```

## Baseline

Added 5 pre-existing vitest keys (same first error lines at `2e996c56`, `5-vitest-compare.log`):

- `src/pages/routines/myWork.test.ts > buildMyWork > grades today into Do now, Due soon, Later today; counts all of it, nags on the first two`
- `src/pages/routines/myWork.test.ts > buildMyWork > is amber when only soft nags, and quiet when nothing has reached its reminder`
- `src/pages/routines/myWork.test.ts > buildMyWork > leads with the shift checklist within the same colour, never above something red`
- `src/pages/routines/myWork.test.ts > buildMyWork > never counts drafts, anytime routines, or done work; says Continue for started runs`
- `src/pages/routines/myWork.test.ts > buildMyWork > speaks Spanish`

Known vitest still failing: `noDashes` (`AssertionError: expected [ …(20) ] to deeply equal []`; the hit list includes `pages/admin/RequestsPage.tsx`), the three `ListingStudioPage` tests (`Error: [vitest] No "useReframeWebListingImage" export is defined on the "../../hooks/useWebStore" mock.`), and `RestorationQueuePage.test.tsx` (`Error: EMFILE: too many open files, open 'C:\Coding\ecothrift-dashboard\frontend\node_modules\@mui\icons-material\esm\SettingsInputCompositeOutlined.js'`).

Known py: the 77 inventory baseline nodes, plus the 5 status-table `SUBFAILED` on `test_preprocessing_status_completed_step_table_per_preprocess_status`.

## Now passing

Not pruned.

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in`
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column and the pick-your-shift line`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once`
- `apps/inventory/tests/test_restoration_history_forget.py::RestorationHistoryForgetTests::test_clear_history_clears_notes_and_superseded_not_actions`

# R-074 · Tests: the Thrift+ reward engine (Phase 2), the R-073 fixes, and the Monday pre-ship run
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 16:02 · **Finished:** 2026-09-25 16:15 · **Status:** done · **GREEN**

Snapshot `be51f372` (`refs/runner/R-074`). Compare-to `2e996c56` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-074/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1205 passed (1214), 4 files failed, exit 1 | 0 | 4 tests + RestorationQueuePage file + 5 myWork | 6 baseline keys |
| tsc | exit 0 | 0 | 0 | — |
| py: thriftplus core inventory accounts pos buying + NoDashesTests | 86 failed, 1274 passed, 71 subtests passed, 749.97s, exit 1 | 0 | 78 inventory nodes + 2 POS delivery tests + NoDashesTests + 5 status-table SUBFAILED | — |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## POS

No NEW failure in `apps/pos`. The only POS failures are the two baseline delivery tests: `test_create_delivery_from_past_cart_is_audited` and `test_line_items_and_optional_scan_verify`.

## R-073 fixes

`apps/core/tests/test_ai_settings.py::AiModelResolutionTests::test_seed_rows` passed. It is not in the failure list.

`NoDashesTests` still fails. The list is only the 3 webstore files. `inventory\approval_kinds.py` and `buying\services\close_model_fit.py` are not in it.

- `apps/routines/tests.py::NoDashesTests::test_apps_source_has_no_em_or_en_dashes` — `E       AssertionError: Lists differ: ['webstore\\emails.py', 'webstore\\models.py', 'webstore\\services\\hours.py'] != []`

No `FAILED` line in `apps/thriftplus`, `apps/core`, `apps/accounts`, or `apps/buying`.

## migrations-check

Only the two known webstore lines. No `thriftplus` or `core` operations.

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

Not pruned. Vitest baseline keys that passed:

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in`
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column and the pick-your-shift line`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once`

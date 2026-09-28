# R-077 · Tests: the Monday ship tree plus the security fix
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 16:46 · **Finished:** 2026-09-25 16:51 · **Status:** done · **GREEN**

Snapshot `9fefe4a8` (`refs/runner/R-077`). Compare-to `ef679c16` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-077/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/accounts apps/pos apps/core apps/ai | 365 passed, 12 subtests passed, 254.29s, exit 0 | 0 | 0 | — |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## POS

No NEW failure in `apps/pos`. No `apps/pos` failure at all.

`apps/accounts/tests/test_team_member_gates.py` is in the tree and the accounts suite passed, so that file did not fail.

## migrations-check

Only the two known webstore lines.

## NEW failures

None.

## Baseline

Nothing added. Nothing pruned.

## Now passing

None.

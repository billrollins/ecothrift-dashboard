# R-026 result · Tests: Spark (Meta) as an AI provider

**Status:** RED

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:20 · **Finished:** 2026-09-23 17:28

Snapshot `85ac6a0a` (`refs/runner/R-026`). Compare-to `9e969a42`. Logs: `workspace/runner/R-026/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py | 20 failed, 251 passed, 11 subtests passed (186.61s) | 1 | 19 | 0 |
| vitest: src/pages/admin/settings | 20 passed (3 files, 3.75s) | 0 | 0 | 0 |
| tsc | 0 errors, exit 0 | 0 | 0 | 0 |
| migrations-check | 2 operation lines, exit 1 | 0 | 2 | 0 |

The 19 known pytest failures are the `test_ai_cleanup_batch` keys in the baseline. They failed again. No xAI node is in the failure list.

## NEW

1. `apps/core/tests/test_ai_settings.py::AiModelResolutionTests::test_seed_rows` — log `1-py.log`
   - `E       AssertionError: Items in the first set but not the second:`
   - `E       'muse-spark-1.3-contributor'`
   - `E       'muse-spark-1.3'`
   - Passes at `9e969a42`: 1 passed (`compare-1-py.log`).

## Baseline

Nothing appended.

## Now passing

None.

## Expect

- No `FAILED` line names `MetaSparkTests` or `MetaModelListTests`, so those passed with the 251.
- Settings vitest is 20 passed. tsc exited 0.
- Known migrations: the two `webstore` `Rename index` lines (`4-migrations.log`).

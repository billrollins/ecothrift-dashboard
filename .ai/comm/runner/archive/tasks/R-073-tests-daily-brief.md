> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-073 · Tests: the morning brief (data_platform Phase 2)

- **Type:** test · **Snapshot ref:** `refs/runner/R-073` (`34014f81`) · **Compare-to:** `2e996c56` (v2.105.1, production)
- **What changed since R-072's snapshot:**
  - **Models and migrations:** `core.ContextSnapshot` and `core.DailyBrief` (`core.0009`); the AiAction `SUPERVISOR_BRIEF` seed (`core.0010`).
  - **Services:** `apps/core/services/context_snapshot.py` (sections: sales, labor, routines, inventory, buying, requests, thrift_plus) and `apps/core/services/daily_brief.py` (a forced tool call through `llm_router`).
  - **API:** views `daily_brief` and `daily_brief_write` (`/api/core/brief/`, `/api/core/brief/write/`).
  - **Command:** `build_daily_brief`.
  - **Frontend:** `pages/brief/BriefPage.tsx` (+ test), `api/brief.api.ts`, the `/brief` route, and the nav item `brief` in the essentials group (superuser only).
- **New tests:** `apps/core/tests/test_daily_brief.py` and `frontend/src/pages/brief/BriefPage.test.tsx`. No test makes a real AI call; `_ask` is mocked.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/core apps/hr apps/routines`
4. `migrations-check`

## Expect
- `tsc` exits 0.
- vitest and pytest have 0 NEW failures against v2.105.1 (R-071 and R-072 list the baseline).
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines.

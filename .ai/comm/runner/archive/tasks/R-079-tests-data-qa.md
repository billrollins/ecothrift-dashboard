> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-079 · Tests: data QA (data_platform Phase 3), and the QA section in the morning brief

- **Type:** test · **Snapshot ref:** `refs/runner/R-079` (`76927636`) · **Compare-to:** `refs/runner/R-078` (`737f928d`, GREEN)
- **Where:** the main working tree.
- **What changed since R-078:**
  - **New app `apps/qa`** (in `INSTALLED_APPS`; urls at `/api/qa/`):
    - models `QARun` and `QAFinding` (`qa.0001`), and the AI action `QA_TRIAGE` (`qa.0002`);
    - `checks.py` (15 checks named by register ID);
    - `services/runner.py` (run, AI triage, stage fixes);
    - request kind `qa.sold_from_cart`;
    - command `run_qa`;
    - views `latest`, `history`, `run` (superuser).
  - **The brief:** `apps/core/services/context_snapshot.py` gets a `qa` section, and the prompt in `daily_brief.py` mentions QA.
  - **Tests:** `apps/core/tests/test_ai_settings.py` now expects 18 AI actions; `test_daily_brief.py` expects the `qa` section.
  - **Frontend:** `pages/admin/QAPage.tsx` (+ test), `api/qa.api.ts`, the `/admin/qa` route, and a "Data QA checks" link on `RequestsPage`.
  - **Docs:** `.ai/extended/data-quality.md` gets TP-01 to TP-04 and a standing-checks section. BOGO is confirmed in `.ai/extended/discount-logic.md`.
- **New tests:** `apps/qa/tests/test_qa.py` and `frontend/src/pages/admin/QAPage.test.tsx`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/qa apps/core apps/pos/tests/test_cart_totals.py`
4. `migrations-check`

## Expect
- `tsc` exits 0.
- vitest and pytest: 0 NEW failures against R-078. `RequestsPage.test.tsx` still passes with the new header link.
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines.

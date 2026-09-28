> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-077 · Tests: the Monday ship tree plus the security fix (staff endpoints no longer open to online-store customers)

- **Type:** test · **Snapshot ref:** `refs/runner/R-077` (`9fefe4a8`) · **Compare-to:** `refs/runner/R-075` (`ef679c16`, GREEN)
- **This is the tree that ships Monday (v2.108.0):** R-075's tree plus only this fix. It does **not** include Thrift+ Phase 3 (that is R-076, on the main working tree).
- **The fix:** a customer's online-store sign-in gets the same JWT as staff, so endpoints that checked only `IsAuthenticated` let customers in. They now use the new `IsTeamMember` (Employee, Manager or Admin, or any superuser; `apps/accounts/permissions.py`):
  - `/api/pos/sale-mode/` (its POST changes the Labor Day override);
  - `/api/pos/dashboard/metrics/`, `alerts/`, `sales-goal/`, `department-goals/`;
  - `/api/ai/models/` and `/api/ai/chat/`;
  - `/api/core/system/print-server-version/` and `print-server-releases/`.

  `settings_production.py` also sets DRF `NUM_PROXIES = 1`. The edit is `scripts/security/team_member_gates.py`. New test: `apps/accounts/tests/test_team_member_gates.py`.
- **No frontend change**, so no vitest or tsc.

## Run
1. `py: apps/accounts apps/pos apps/core apps/ai`
2. `migrations-check`

## Expect
- 0 NEW failures against R-075. `test_team_member_gates.py` passes (a customer gets 403 on all 10; an employee and a group-less superuser still get in).
- **POS:** say plainly whether any `apps/pos` failure is NEW.
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines.

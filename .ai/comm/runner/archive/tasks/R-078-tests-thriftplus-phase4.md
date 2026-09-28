> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-078 · Tests: Thrift+ Phase 4 (member sign-in, scanner API, portal, staff service, overview), the discount logic, and return credit

- **Type:** test · **Snapshot ref:** `refs/runner/R-078` (`737f928d`) · **Compare-to:** `refs/runner/R-076` (`18ef1d59`, GREEN)
- **Where:** the main working tree (Phases 3 and 4). It is **not** the Monday ship tree, which is R-077.
- **What changed since R-076:**
  - **Discount logic** (`.ai/extended/discount-logic.md`): a percent sale now scales the tag and the reward alike, where before the member got the better of the two.
    - Banking pays 1.05× (`thrift_plus_bank_bonus`).
    - A line never gives back more than was paid after its discounts. The bonus shrinks by the share paid with Thrift+ money.
    - Code: `services/trip.py`, `register.trip_lines` and `after_complete`.
  - **Returns:** the credit is now 95% of the pre-tax price paid (`thrift_plus_return_credit_share`).
  - **The security fix** from R-077 (`IsTeamMember`, `NUM_PROXIES`) is in this tree too.
  - **Phase 4:**
    - `services/member_auth.py` (member sessions in a `tp_session` cookie, card plus last-4 lockout, reset links);
    - `services/scanner.py` and `public_views.py` under `/api/thriftplus/public/`;
    - models in `thriftplus.0008`;
    - the staff `accounts/{id}/money/` and `adjust/`, and `rewards/overview/`;
    - the register picks up the app's choice.
  - **Frontend:**
    - new `api/thriftPlusScanner.api.ts` (+ test), `components/pos/ThriftPlusSignupDialog.tsx`, `components/thriftplus/PersonFields.tsx` (moved out of `MembersTab`), `pages/thriftplus/MemberMoney.tsx` and `OverviewTab.tsx`;
    - `TerminalPage` (the sign-up button), `ThriftPlusPanel` (the app-choice alert);
    - Thrift+ page tests updated.
  - **Settings:** `thriftplus_login`, `thriftplus_reset` and `thriftplus_scan` throttle rates in `ecothrift/settings.py`.
- **New or changed tests:**
  - `apps/thriftplus/tests/test_public_api.py` (new), `test_staff_service.py` (new), and `test_register.py` (bonus, sale scaling, 95% credit);
  - `frontend/src/api/thriftPlusScanner.api.test.ts` (new), `ThriftPlusPanel.test.tsx` and `ThriftPlusPage.test.tsx`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/thriftplus apps/pos apps/accounts apps/core apps/ai`
4. `migrations-check`

## Expect
- `tsc` exits 0.
- vitest and pytest: 0 NEW failures against R-076.
  - **POS:** say plainly whether any `apps/pos` failure is NEW.
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines.

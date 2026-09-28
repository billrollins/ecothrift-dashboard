> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-074 · Tests: the Thrift+ reward engine (Phase 2), the R-073 fixes, and the Monday pre-ship run

- **Type:** test · **Snapshot ref:** `refs/runner/R-074` (`be51f372`) · **Compare-to:** `2e996c56` (v2.105.1)
- **Why one big run:** this snapshot is the ship candidate for Mon 09-28 (Requests, Thrift+ Phases 1 and 2, the brief, the scaled range). It includes the POS apps, so it doubles as the pre-ship run.
- **What changed since R-073's snapshot:**
  - **R-073 fixes:**
    - `apps/core/tests/test_ai_settings.py::AiModelResolutionTests::test_seed_rows` now expects 17 AI actions (the brief and Thrift+ families are seeded);
    - the em dash in `apps/inventory/approval_kinds.py` is gone, as are the en dashes in `apps/buying/services/close_model_fit.py`.
  - **Models and migrations:** `thriftplus.ItemReward`, `RewardEvent`, `RewardRun`, `RewardFamily` and `FamilyLink` (`thriftplus.0003`). Seeds for 2 settings and the AI action `THRIFTPLUS_FAMILY` (`thriftplus.0004`).
  - **Services:**
    - `apps/thriftplus/services/rewards.py` (the pure `step`, `plan`, `recompute`, `member_price`, `summarize`);
    - `apps/thriftplus/services/families.py` (pgvector neighbours plus one forced tool call).
  - **Commands:** `recompute_rewards` and `assign_reward_families`.
  - **Request kind:** `thriftplus.reset_rewards` in `apps/thriftplus/approval_kinds.py`, registered in `ThriftPlusConfig.ready`.
  - **API:** `/api/thriftplus/rewards/preview/`, `item/` and `runs/` (Manager or Admin).
  - **Frontend:** `pages/thriftplus/RewardsTab.tsx`, a third tab on `ThriftPlusPage.tsx`, types and API.
- **New tests:** `apps/thriftplus/tests/test_rewards.py`, plus a Rewards test in `frontend/src/pages/thriftplus/ThriftPlusPage.test.tsx`. No test makes a real AI call; `families._ask` and `neighbours` are mocked.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/thriftplus apps/core apps/inventory apps/accounts apps/pos apps/buying apps/routines/tests.py::NoDashesTests`
4. `migrations-check`

## Expect
- `tsc` exits 0.
- vitest and pytest: 0 NEW failures against v2.105.1. R-071 to R-073 list the baseline.
  - `test_seed_rows` passes.
  - `NoDashesTests` still fails, but its list no longer names `inventory\approval_kinds.py` or `buying\services\close_model_fit.py`. Only the 3 webstore files remain; give the list.
- **POS:** say plainly whether any failure in `apps/pos` is NEW. The 2 known delivery tests are baseline.
- For any failure, give the test id and its first error line.
- `migrations-check` shows only the 2 known webstore lines: no `thriftplus` or `core` operations.

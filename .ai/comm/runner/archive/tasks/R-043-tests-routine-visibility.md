> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-043 · Tests: routine visibility (today-only covers, owners, punches)

- **Type:** test · **Snapshot ref:** `refs/runner/R-043` (`f1a0796a`) · **Compare-to:** `2d1e2c5e` (v2.101.0, production)
- **Why:** Command Center picks were permanently changing section owners. In production, section "David" became Carrie's, and David's aisle was checked twice on 09-23.
- **What changed:**
  - Section checks move **for today only**, aisle by aisle. The owner stays the owner and changes only in Settings.
  - The Command Center "owner" pick is now a today-only cover (`qa_views.QaAssignView`); picking the owner again removes the cover.
  - `assign_run`: an owner's check becomes per-aisle covers, and it no longer sets `section.owner`.
  - The phone "cover" of a section check uses covers too.
  - The owner's form (`kinds.owned_sections`) leaves out aisles covered today.
  - `day_punches` picks an open punch, then the latest one (Ashley showed as "Left" while clocked in).
  - Section rows carry `standing_owner` and `covered_today`; the UI shows "for <owner>".
  - Tests: `test_owner_change_drops_the_former_open_tally` was replaced by `test_command_center_owner_pick_is_today_only`, plus 2 new cover tests and `DayPunchesTests` in `apps/routines/tests_qa.py`.

## Run
1. `py: apps/routines apps/hr apps/pos apps/inventory`
2. `vitest`
3. `tsc`
4. `migrations-check`

## Expect
- The new and updated tests pass.
- Report separately any NEW failure in `apps/routines` (the Command Center and today payloads may assert the old owner behaviour) and in POS.

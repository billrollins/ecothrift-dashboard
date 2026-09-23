> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-014 · test · Pre-ship full run (before the Heroku deploy)

- **Snapshot:** `refs/runner/R-014` (commit `fe2d2275` on `main`)
- **Compare-to:** `ecc60707`
- **Why:** the owner wants to push to Heroku without breaking POS. Covers every app, including `apps/pos`. `--create-db` also runs every migration from scratch, including `buying/0021` to `0026`, `routines/0027` and `0028`, and `core/0004` to `0006`.
- **Run:**
  1. `py: apps`
  2. `vitest`
  3. `tsc`
  4. `migrations-check`
- **Expect:**
  - GREEN (no NEW failures against the baseline). The R-008 tsc error (`BuyingCategoryGoal`) is fixed.
  - Call out any failure under `apps/pos` first, even a known one.
- **Result:** `results/R-014-preship-full.md`, in the test shape. Update it as each command finishes.

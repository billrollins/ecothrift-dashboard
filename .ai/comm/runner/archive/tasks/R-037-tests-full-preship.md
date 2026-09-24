> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-037 · Full pre-ship test run (POS and processing must be clean)

- **Type:** test · **Snapshot ref:** `refs/runner/R-037` (`241ff2ee`) · **Compare-to:** `9e969a42` (v2.99.0, in production)
- **Why:** the owner ships only if there is zero chance of breaking POS or processing in production. It supersedes R-035.
- **What changed since v2.99.0:**
  - 23 categories and B-Stock code mapping (`buying/0028`); Focus chip;
  - Spark provider (`core/0007`);
  - condition shrink (`buying/0029`), sell speed (`buying/0030`), 12-week target (`buying/0031`);
  - the "why" line; sweep price snapshots.

## Run
1. `py: apps/pos apps/inventory apps/buying apps/core apps/webstore apps/accounts apps/labels apps/floorplan`
2. `py: .` (everything else; skip nothing)
3. `vitest`
4. `tsc`
5. `migrations-check`

## Expect
- GREEN: no NEW failures.
- Call out **any** failure in `apps/pos` or processing (`apps/inventory` processing, check-in, preprocessing) separately, even a KNOWN one.

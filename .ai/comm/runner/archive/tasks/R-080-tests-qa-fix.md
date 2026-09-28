> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-080 · Tests: the R-079 fix (the QA test patched its check list twice)

- **Type:** test · **Snapshot ref:** `refs/runner/R-080` (`2f1db861`) · **Compare-to:** `refs/runner/R-079` (`76927636`)
- **What changed since R-079:** only `apps/qa/tests/test_qa.py`. `test_a_broken_check_is_recorded_and_the_rest_still_run` patches only `runner.CHECKS`, with a list built once. Before, the second patch read the already-patched list, so the broken check ran twice and `get()` found 2.

## Run
1. `py: apps/qa`

## Expect
- All of `apps/qa` passes (5 tests).

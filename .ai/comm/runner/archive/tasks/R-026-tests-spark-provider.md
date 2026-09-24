> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-026 · Tests: Spark (Meta) as an AI provider

- **Type:** test · **Snapshot ref:** `refs/runner/R-026` (`85ac6a0a`) · **Compare-to:** `9e969a42`
- **What changed:**
  - `llm_router` has a `meta` provider (`muse-*` models), built on a shared OpenAI-compatible call used by xAI and Meta;
  - key lookup, the Settings > AI catalog lister, and `AiModel.PROVIDER_META`;
  - migration `core/0007_ai_provider_meta`;
  - the frontend provider label.

## Run
1. `py: apps/core apps/floorplan apps/labels apps/inventory/tests/test_ai_cleanup.py apps/inventory/tests/test_ai_cleanup_batch.py apps/buying/tests/test_manifest_upload.py apps/buying/tests/test_valuation.py`
2. `vitest: src/pages/admin/settings`
3. `tsc`
4. `migrations-check`

## Expect
`MetaSparkTests` and `MetaModelListTests` pass. xAI tests are unchanged.

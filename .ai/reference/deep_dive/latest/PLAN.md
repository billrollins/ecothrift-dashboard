# Deep Dive Execution Plan

## Executive Summary

- **Objective:** Align steering docs and changelog with **shipped** preprocessing: **cleanup CSV apply → `ai_*`**, **`preprocessing-review` PATCH**, **`finalize_preprocessing`** (`snapshot_finalize_from_ai_and_standard` + `ManifestRow` rebuild), and UI step **Final Review**.
- **Highest priority work:** Fix initiative + `inventory-pipeline.md` step naming; reconcile CHANGELOG notebook paths; verify `consultant_context.md` extended TOC = `context.md`.
- **Requires user approval before execution:** Semver **release** (bump `.version`, tag, changelog section promote); any **`git rm`** of reference trees; initiative **archive/move**.
- **Suggested execution mode:** **Staged passes** — docs first, then optional release cut.

## Immediate Safe Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `SAFE-001` | P3 | Ensure CI/local ignore keeps `__pycache__`, `dist`, `.vite` unstaged | `.gitignore` if gaps | Avoid noisy commits | `05_cleanup_and_restructure_audit.md` §Generated | no | `git status` clean of those paths when committing |
| `SAFE-002` | P2 | Recreate / keep `deep_dive/latest/` as canonical; retain `_runs/` history | `.ai/reference/deep_dive/` | Protocol expectation | `00_run_summary.md` | no | Seven files present under `latest/` |

## Context / Extended Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `CTX-001` | P1 | Rename preprocessing Step 3 prose to **Final Review**; add one sentence on finalize coalesce (`final_*` from `ai_*` + `standard_*`, `final_title` from `ai_title`) | `.ai/extended/inventory-pipeline.md` | Matches `PreprocessingStepper.tsx` + `layer_helpers.snapshot_finalize_from_ai_and_standard` | `02_context_and_extended_audit.md` | no | Grep doc for “Manual Review” step 3 → resolved or qualified as post-finalize |
| `CTX-002` | P2 | Parity pass: extended TOC in `consultant_context.md` vs `context.md` (15 files) | `.ai/consultant_context.md` | Maintenance rule | `02_context_and_extended_audit.md` | no | Both TOCs list same filenames |

## Initiative Dispositions

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `INIT-001` | P1 | Update **Progress (rollup)** — Preprocessing row: shipped sub-steps for Standardize / AI Cleanup / **Final Review**; remove “placeholder Step 3” if inaccurate | `.ai/initiatives/order_processing_pipeline_rebuild.md` | Rollup contradicts UI | `03_initiatives_audit.md` | no | Progress table matches stepper + main APIs |
| `INIT-002` | P3 | Add pointer to `cleanup_csv_validate.py` rule IDs + `rejected_rows` shape if contractors need it | initiative or `.ai/reference/` | Onboarding | `01_codebase_inventory.md` | no | Link resolves |

## Version / Changelog Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `REL-001` | P2 | Fix `[Unreleased]` **Documentation** bullets that cite `workspace/notebooks/ai-cleanup/` if that tree is gone; point at `workspace/ai-cleanup-grok/` or “removed” note | `CHANGELOG.md` | Tree vs docs mismatch | `04_version_changelog_audit.md` | no | Paths in changelog exist or are explicitly historical |
| `REL-002` | P1 | When releasing: promote `[Unreleased]` slice to dated header; bump `.version` + root `package.json` | `CHANGELOG.md`, `.version`, `package.json` | Semver hygiene | `04_version_changelog_audit.md` | **yes** | One release header; version tripartite match |

## File Removals

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `DEL-001` | P2 | Confirm whether `workspace/notebooks/ai-cleanup/` deletion is intentional; if yes, complete doc purge; if no, restore from VCS | `workspace/notebooks/ai-cleanup/`, docs | `git status` shows `D` | `05_cleanup_and_restructure_audit.md` | **yes** | No broken links in CHANGELOG/context |

## Restructures Needed

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `STRUCT-001` | P3 | Optional: add `reference/cleanup_csv_contract.md` | `.ai/reference/` | Single source for wide vs narrow | `05_cleanup_and_restructure_audit.md` | no | Linked from initiative + pipeline |

## Follow-Up Research

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `RESEARCH-001` | P3 | Document staff-facing when to use `manual-review` vs `preprocessing-review` (lifecycle) | extended + ux | Two review endpoints | `01_codebase_inventory.md` | no | Table: pre-finalize vs post-finalize |

## Execution Order

1. **`CTX-001`** + **`INIT-001`** (fast, removes most confusion).
2. **`REL-001`** + **`DEL-001`** decision (avoid phantom paths).
3. **`CTX-002`** consultant TOC parity.
4. **`REL-002`** only when user asks for a release.

## Do Not Do

- Do not move initiatives without explicit user approval.
- Do not bump `.version` for steering-only report generation.
- Do not delete ambiguous user/reference files; classify them first.
- Do not rewrite docs for tone if facts are already correct.

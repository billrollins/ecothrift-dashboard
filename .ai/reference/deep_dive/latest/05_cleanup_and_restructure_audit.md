# Cleanup & Restructure Audit — 2026-05-18

## Executive Summary

| Category | Observation | Recommendation |
|---|---|---|
| **Generated debris (`__pycache__`)** | Some `*.pyc` appeared in **`git status`** historically on user machines | Keep ignored; **`git restore/clean`** before push if accidentally staged |
| **Scratch/backfill helpers** | `_backfill_manifest_denorm.py`** at repo root | Either delete after parity with **`intake_po_repair.backfill_manifest_denorm_fields`** logic or relocate into documented mgmt cmd |
| **`commit_message.txt`** placeholder | Repo shows **`---` line | Must be replaced **before `2_push_github.bat`** per **`review.0.Bump` Part 5** |
| **Deep dive artifacts | Previous **`latest`** archived to **`_runs/20260518T092130/previous_latest/`** | ✅ |
| **`reference/diffs`** | Diff summary added (**`20260518-092215.diff.md`**) | Periodic prune old summaries optional |

### Risk register

| ID | Severity | Detail |
|---|---|---|
| DEBRIS-BC | Medium | Compiled python should never enter commits — verify pre-push |
| MSG-EMPTY | Medium | Deploy bat failure if **`commit_message.txt`** untouched |
| SQL-OPS | Medium | Operational SQL (`_recon/`) duplicates Python truth — reconcile when changing repair rules |

### Restructures (⚠ approvals)

None mandatory; optional future: consolidate **`.ai/reference/order_processing_pipeline_rebuild`** SQL under **`extended/sql/`** if redundancy hurts discoverability (**low value** unless team agrees).

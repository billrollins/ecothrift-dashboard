# Deep Dive PLAN — Post–v2.24.1 steering (executed)

## Executive Summary

Most items from the pre-cleanup deep dive are **obsolete** (intake wave shipped). This plan records **remaining product work** only.

## Remaining Work

| id | priority | action | requires_user_approval |
|---|---|---|---|
| FR-UI-001 | P1 | Final Review visual pass per `reference/fix_this.md` + directive | no (product) |
| INIT-ARC-002 | P2 | Archive `order_processing_pipeline_rebuild` when Final Review ships | yes |
| SCRATCH-003 | P3 | Delete repo root `_backfill_manifest_denorm.py` if still present | yes |

## Do Not Do

- Recreate `consultant_context.md` or `.ai/plans/`.
- Duplicate `CHANGELOG` narrative inside `context.md`.

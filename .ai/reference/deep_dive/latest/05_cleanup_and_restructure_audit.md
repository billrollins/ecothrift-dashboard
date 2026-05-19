# Cleanup & Restructure Audit — 2026-05-18

## Executive Summary

| Category | Action taken |
|---|---|
| Retired paths | `consultant_context.md`, `.ai/plans/`, `.ai/debug/` removed if present |
| Reference prune | `reference/issues/`, old diff `20260506-*`, `Rich Manifest Templates/` removed |
| New indexes | `.ai/README.md`, `reference/README.md`, intake `README.md` |
| Deep dive | Prior `latest/` → `_runs/20260518T092130/previous_latest/` |

## Remaining Optional

| Item | Notes |
|---|---|
| Repo root `_backfill_manifest_denorm.py` | Out of `.ai/` scope; delete when user approves (superseded by `intake_po_repair`) |

## Confidence

High for `.ai/` tree; Medium for any uncommitted user-local deletes not yet in git.

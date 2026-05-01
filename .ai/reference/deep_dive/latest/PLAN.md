# Deep Dive Execution Plan

## Executive Summary

- **Objective:** Keep steering artifacts truthful relative to the **large `[Unreleased]`** inventory/processing slice, maintain archive hygiene, and avoid accidental commits of generated files.
- **Highest priority work:** (1) User-approved **release slice** when ready (`CHANGELOG` + semver); (2) confirm **no stray committed artifacts**; (3) optional **`_index.md`** link to archived initiative protocols for discoverability.
- **Requires user approval before execution:** Semver bump, deleting/cherry-moving `.ai/reference` blobs, any initiative archive moves.
- **Suggested execution mode:** **Staged passes** — hygiene first, release second, structural doc cleanup last.

## Immediate Safe Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|----|----------|--------|-------|--------|---------------|-------------------------|------------------|
| SAFE-001 | P1 | Before commit: remove/unstage `__pycache__/`, `frontend/dist/`, `.vite` caches | workspace tree | Prevents noisy PRs | `05_cleanup#Generated` | no | `git status` clean of bytecode/build caches intended for ignore |
| SAFE-002 | P2 | Optionally run `vitest` + targeted Django tests after inventory edits | `frontend/`, `apps/inventory/tests/` | Regression guard | `01_codebase#Tests` | no | CI/local tests green |

## Context / Extended Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|----|----------|--------|-------|--------|---------------|-------------------------|------------------|
| CTX-001 | P2 | When cutting a release, refresh extended inventory docs for any **new routes/APIs** named in release notes | `.ai/extended/inventory-pipeline.md`, `frontend.md`, `backend.md` | Steering parity | `02_context#Gaps` | no | Extended TOC unchanged unless files added/removed |
| CTX-002 | P3 | After Final Review mockup pass completes, shrink duplicated pointers if desired | `.ai/reference/fix_this.md` etc. | Reduce confusion | `02_context#Gaps` | yes | User confirms which docs remain canonical |

## Initiative Dispositions

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|----|----------|--------|-------|--------|---------------|-------------------------|------------------|
| INIT-001 | P3 | Optional: add explicit link from `_index.md` to **`_archived/_protocols/`** (stub already points there) | `.ai/initiatives/_index.md` | Reduces “two README” confusion | `03_initiatives#Notes` | no | Readers land on canonical protocol table |

## Version / Changelog Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|----|----------|--------|-------|--------|---------------|-------------------------|------------------|
| REL-001 | P1 | Run `review.0.Bump` + `session.9.Close.md` Part 2 when scope frozen: move `[Unreleased]` → `## [x.y.z]` | `.version`, root `package.json`, `CHANGELOG.md` | Large unreleased inventory narrative needs tag | `04_version#Release Traceability` | yes | Version triple aligned; dated section matches shipped behavior |
| REL-002 | P2 | Confirm Heroku/release migrate ordering for `0038`/`0039` inventory migrations when deploying processor features | deployment checklist | Prod schema parity | `01_codebase#Migrations` | yes | Migrations applied on prod in order |

## File Removals

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|----|----------|--------|-------|--------|---------------|-------------------------|------------------|
| DEL-001 | P2 | Delete local only: `__pycache__`, `frontend/dist`, caches | generated paths | Noise / binary churn | `05_cleanup#Generated` | no | Not present in `git diff` |

## Restructures Needed

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|----|----------|--------|-------|--------|---------------|-------------------------|------------------|
| STRUCT-001 | P3 | Defer splitting `PurchaseOrderViewSet` unless initiative owns refactor | `apps/inventory/views.py` | Risk >> reward today | `05_cleanup#Code` | yes | ADR or initiative scope accepted |

## Follow-Up Research

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|----|----------|--------|-------|--------|---------------|-------------------------|------------------|
| RESEARCH-001 | P3 | Map missing automated tests for auth/core/hr/consignment if those domains become hot | `apps/*/tests` | Coverage holes | `01_codebase#Tests` | no | Written test inventory memo |

## Execution Order

1. **SAFE-001** — working tree hygiene (no approvals).
2. **REL-001** — user-triggered release pass when feature set is frozen.
3. **CTX-001** — docs refreshed in same merge window as release when APIs changed.
4. **INIT-001** / **CTX-002** — optional documentation polish (`INIT-001` needs no approval unless user dislikes editing `_index.md`).

## Do Not Do

- Do not move initiatives without explicit user approval.
- Do not bump `.version` for steering-only report generation.
- Do not delete ambiguous user/reference files; classify them first.
- Do not rewrite docs for tone if facts are already correct.

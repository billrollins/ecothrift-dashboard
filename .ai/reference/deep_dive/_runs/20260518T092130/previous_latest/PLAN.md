# Deep Dive PLAN — Execution (post-audit)

## Executive Summary

- **Objective:** Land intake rebuild wave safely (DB + Django + SPA) **without surprises** vs steering docs — after user approves semver release narrative.
- **Highest priority:** Finish **Session 15** numbered steps (**initiative**) + guard tests + changelog MINOR story on release gate.
- **Requires user approval before execution:** Version **MINOR/MAJOR** choice; initiative archive moves; ambiguous file deletes (`_backfill_manifest_denorm.py`).
- **Suggested execution mode:** **Staged merges** (*schema/service → API/UI → QA → changelog bump*).

---

## Immediate Safe Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| SAFE-DEEP-001 | `P1` | Keep **`CHANGELOG [Unreleased]`** synced with WT highlights | `CHANGELOG.md` (repo root) | Traceability vs deep dive | **`04_*`, `03_*`** | `no` | Bullets cite migrations + cmds |
| SAFE-PIPE-002 | `P0` | Remove **`PreprocessingOrder`** wording from **`inventory-pipeline.md`** canonical Step | `.ai/extended/inventory-pipeline.md` | Post-**`0047`** truth | **`02_* §PIPE-Δ`** | `no` | Grep **`PreprocessingOrder`** returns informational references only |

## Context / Extended Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| CTX-WAVE-003 | `P1` | Add short **Working tree** clause for Session 15 wave | `.ai/context.md`; `.ai/consultant_context.md` | Compass vs reality | **`02_*`** | `no` | Mentions **`0045+`** anchor |
| CTX-LINK-004 | `P3` | Add **`review.1.Diff`** to protocol map bullet | `.ai/context.md` | Discoverability | **`02_*`** | `no` | Map line lists Diff protocol |

## Initiative Dispositions

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| INIT-KEEP-005 | `P2` | Keep **`order_processing_pipeline_rebuild`** **Active** until release closes Session 15 finish line | `.ai/initiatives/*.md`, `_index` | Governance | **`03_*`** | `no` | Session 15 checklist ✅ |
| INIT-ARC-VOID | — | _(none recommended now)_ | — | Archive only when shipped + user confirms | **`03_*`** | `yes` | N/A |

## Version / Changelog Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| REL-DEFER-006 | `P1` | **Defer** semver bump pending explicit **release request** (**`review.0.Bump` 2A** gate) | `.version`, root `package.json`, dated `CHANGELOG` section | Policy | **`04_*`** | `yes` (release sponsor) | All three semver sources align |
| REL-MINOR-007 | `P2` | *When releasing:* Prefer **MINOR** for **`0045–0051`** feature bundle | semver triple | Typical ecothrift matrix | **`04_* §Release recommendation`** | `yes` | Release notes cite initiative |

## File Removals

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| SCRATCH-008 | `P3` | Classify/delete **`_backfill_manifest_denorm.py`** | repo root | Superseded by repair service path | **`05_*`** | `yes` | No imports reference stale script |

## Restructures Needed

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| DOC-SQL-009 | `P3` | Optional merge of **`_reference/_sql`** & **`extended/sql`** inventories | `.ai/reference/.../_sql/README.md`, `extended/sql/README.md` | Reduce duplicate entrypoints | **`01_* Scripts`** | `yes` | Single canonical hyperlink path |

## Follow-Up Research

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| QA-FULL-010 | `P1` | Run widened Django + frontend build matrices | CI / local | Confidence before GitHub push | **`00_* Evidence Gaps`** | `no` | Green CI / manual sign-off |

## Execution Order

1. Migrate local/test DB **`0045→0051`**, rerun **`repair_intake_pipeline_pos --verify`** rehearsal.
2. Execute targeted **`pytest`** modules listed in **`01_codebase_inventory.md`** (+ expand if regressions surface).
3. Apply **SAFE-PIPE-002** + **`CHANGELOG`** intake bullets (**SAFE-DEEP-001**) + steering micro-edits (**CTX-WAVE-003**).
4. When user calls release: **`review.0.Bump`** Part 2/3 semver + dated **`CHANGELOG`**, fill **`scripts/deploy/commit_message.txt`**, **`code.9.Push`** or **`session.9.Close`**.
5. Classify/remove scratch script (**SCRATCH-008**) if approved.

## Do Not Do

- Do not **`git push`** or Heroku **`release`** from this auditing pass alone without user mandate.
- Do not **`move_initiative_*`** archives without confirmation.
- Do not semver bump steer-only audits.

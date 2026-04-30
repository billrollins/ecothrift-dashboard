# Deep Dive Execution Plan

## Executive Summary

- **Status (2026-04-30):** `SAFE-001`–`SAFE-002`, `CTX-001`–`CTX-003`, `STRUCT-001` (protocol dedupe), `CHANGELOG` / `README` link parity, and related archived-initiative path fixes are **applied** in the working tree. Remaining rows document the original audit intent.
- **Objective:** Bring AI steering, archive TOC, and cross-links back in sync with **on-disk initiative locations** and **archive inventory**—without moving initiatives or bumping semver unless the user approves a release pass.
- **Highest priority work:** Fix **broken `bstock_auction_intelligence` paths**; add **two missing rows** to `ARCHIVE.md` `_completed` TOC.
- **Requires user approval before execution:** Any **`git mv`** for initiatives; deleting **`files.zip`** or deduplicating protocol trees if that implies removing someone’s working copy convention.
- **Suggested execution mode:** Single **docs-only** pass first (`SAFE-*`, `CTX-*`), then structural decision (`STRUCT-001`).

## Immediate Safe Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `SAFE-001` | P1 | Add missing **`_completed`** TOC rows for **`bstock_auction_intelligence.md`** and **`ui_ux_polish.md`** (summary + archived date consistent with file markers / `CHANGELOG`) | `.ai/initiatives/_archived/ARCHIVE.md` | TOC must match disk file count | `03_initiatives_audit.md` §Archive Consistency | no | Row count for `_completed` = 16; links open |
| `SAFE-002` | P2 | Bump `<!-- Last updated -->` on `ARCHIVE.md` when editing | same | Maintenance rule | `03_initiatives_audit.md` | no | Timestamp present |
| `SAFE-003` | P3 | Optional: add one README bullet for **deep dive** output path `.ai/reference/deep_dive/latest/` | `README.md` | Discoverability | `02_context_and_extended_audit.md` §Protocol Discoverability | no | Link resolves in GitHub/UI |

## Context / Extended Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `CTX-001` | P1 | Replace **`.ai/initiatives/bstock_auction_intelligence.md`** with **`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`** (and clarify “archived initiative” in prose where helpful) | `.ai/context.md`, `.ai/consultant_context.md`, `README.md` (notebook paragraph) | Entry-point docs must not 404 | `02_context_and_extended_audit.md` §Stale References | no | Click paths from each file land in real file |
| `CTX-002` | P1 | Fix relative link in **`Not Yet Implemented`** buying line | `.ai/context.md` | Relative `initiatives/bstock_…` broken | `02_context_and_extended_audit.md` | no | Link works from `.ai/` |
| `CTX-003` | P1 | Update **`vpn-socks5.md`** link to archived bstock initiative path | `.ai/extended/vpn-socks5.md` | Same drift | `02_context_and_extended_audit.md` | no | Link works |
| `CTX-004` | P2 | After preprocessing WIP lands: reconcile **`inventory-pipeline.md`**, **`ux-spec.md`**, **`development.md`** timestamps with shipped UX | `.ai/extended/*.md` | v2.20+ inbound UX | `01_codebase_inventory.md` §Shipped Behavior | no | Describes 3-step preprocessing accurately |

## Initiative Dispositions

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `INIT-001` | P3 | *No move.* Keep **`order_processing`** active until Preprocessing target UX is done and user requests **`move_initiative_to_completed`**. | — | Protocol forbids silent archive | `03_initiatives_audit.md` | **yes** if ever archiving | User explicit instruction + lifecycle protocol file |

## Version / Changelog Updates

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `REL-001` | P2 | If uncommitted inventory changes are **merge-ready**, add **`## [Unreleased]`** section with bullets before next release | `CHANGELOG.md` | Honest traceability | `04_version_changelog_audit.md` | no | `[Unreleased]` reflects merged main; no orphan bump |
| `REL-002` | P3 | *No bump for this deep dive* | `.version`, `package.json` | Steering-only run | `04_version_changelog_audit.md` | no | Versions unchanged |

## File Removals

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `DEL-001` | P2 | Classify **`.ai/reference/Mockups/files.zip`** — track, gitignore, or delete | `.gitignore` and/or delete zip | Untracked debris risk | `05_cleanup_and_restructure_audit.md` | **yes** if deleting user asset | Owner confirms disposition |
| `DEL-002` | P3 | Do **not** delete mock JSX/MD under **`.ai/reference/Mockups/`** without owner sign-off | — | Reference work | `05_cleanup_and_restructure_audit.md` | yes | — |

## Restructures Needed

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `STRUCT-001` | P2 | **Deduplicate** initiative lifecycle protocols: keep either `.ai/initiatives/_archived/_protocols/` **or** `.ai/initiatives/_protocols/` as canonical; update `ARCHIVE.md` / README pointers | `.ai/initiatives/_protocols/**`, `.ai/initiatives/_archived/_protocols/**` | Identical trees drift | `05_cleanup_and_restructure_audit.md` | **yes** | One tree remains; all internal links resolve |
| `STRUCT-002` | P3 | Optional: mass-fix **historical** `CHANGELOG` links to bstock initiative | `CHANGELOG.md` | Cosmetic / archaeology | `02_context_and_extended_audit.md` | no | Grep shows no `initiatives/bstock_auction_intelligence.md` **or** leave historical as-is |

## Follow-Up Research

| id | priority | action | files | reason | source_report | requires_user_approval | acceptance_check |
|---|---|---|---|---|---|---|---|
| `RESEARCH-001` | P2 | Compare byte-for-byte or hashing: `initiatives/_protocols/*.md` vs `_archived/_protocols/*.md` | shell diff | Informs `STRUCT-001` | `00_run_summary.md` §Evidence Gaps | no | Report whether identical |
| `RESEARCH-002` | P3 | Inventory **E2E** or frontend unit-test strategy (Vitest) | `frontend/` | Zero `*.test.tsx` found | `01_codebase_inventory.md` §Test Coverage | no | ADR or initiative note |

## Execution Order

1. `SAFE-001` + `SAFE-002` — repair **`ARCHIVE.md`** `_completed` TOC.
2. `CTX-001`–`CTX-003` — fix **bstock** paths in primary steering + `vpn-socks5.md`.
3. `SAFE-003` — optional README deep-dive line.
4. `REL-001` — when code merges, `[Unreleased]`.
5. `DEL-001` — user decision on **`files.zip`**.
6. `RESEARCH-001` then `STRUCT-001` — protocol dedupe with approval.

## Do Not Do

- Do not move initiatives without explicit user approval.
- Do not bump `.version` for steering-only report generation.
- Do not delete ambiguous user/reference files; classify them first.
- Do not rewrite docs for tone if facts are already correct.

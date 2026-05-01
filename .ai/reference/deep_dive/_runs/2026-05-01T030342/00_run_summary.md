# Deep Dive Run Summary

> **Remediation 2026-04-30:** Steering links (bstock + ui_ux initiatives), `ARCHIVE.md` `_completed` TOC, initiative lifecycle protocol dedupe, and related `CHANGELOG` / `README` updates were applied per [.ai/reference/deep_dive/latest/PLAN.md](PLAN.md). Treat older finding rows below as **historical audit output**.

## Executive Summary

| Field | Value |
|---|---|
| Run date | 2026-04-30 |
| Auditor | Cursor agent (Composer) |
| Repo version | v2.20.0 (`2.20.0` in root `package.json`) |
| Git state | Dirty — many modified/untracked `.ai/`, inventory/preprocessing frontend+backend, `CHANGELOG`, `README`; user-owned WIP |
| Overall confidence | **High** for version/changelog alignment and archive file-vs-TOC gaps; **Medium** for “all stale links” (spot-checked + ripgrep, not every historical `CHANGELOG` link) |

## Top Findings

| Priority | Finding | Why it matters | Evidence | Recommended action |
|---|---|---|---|---|
| P1 | **Broken / misleading initiative path for B-Stock** | Agents and humans follow dead or wrong links for the primary buying narrative | File lives at `.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`; dozens of refs still use `.ai/initiatives/bstock_auction_intelligence.md` or `initiatives/bstock_auction_intelligence.md` (`context.md`, `consultant_context.md`, `README.md`, `frontend.md`, `vpn-socks5.md`, older `CHANGELOG` sections) | Batch-update links to archived path **or** add a short stub at old path that redirects in prose (plan item `CTX-002`) |
| P1 | **`ARCHIVE.md` `_completed` TOC missing two files** | Archive index is the contract for discoverability; drift erodes trust | On disk: **16** `_completed/*.md`; TOC lists **14** rows — missing **`bstock_auction_intelligence.md`**, **`ui_ux_polish.md`** | Add TOC rows + bump `ARCHIVE.md` timestamp (`SAFE-002`) |
| P2 | **Duplicate initiative lifecycle protocol trees** | Same six protocols maintained under `.ai/initiatives/_protocols/` and `.ai/initiatives/_archived/_protocols/` | Both trees contain 6 protocol files + README; root README admits canonical wording “under `_archived/_protocols/`” | Pick one canonical location; symlink or delete duplicate after approval (`STRUCT-001`) |
| P2 | **Untracked reference debris** | Clutters repo and may get committed accidentally | `git status`: `.ai/reference/Mockups/files.zip`; optional mock JSX/MD under Mockups | Classify: gitignore, delete, or track intentionally (`DEL-001`) |
| P3 | **README “last updated” vs reality** | Onboarding table may undersell current protocols | `README.md` header still says initiatives index “may be empty”; `review.9.Deep` and deep-dive layout exist | Light README touch when doing doc pass (`SAFE-003`) |

## Report Index

| Report | Status | Notes |
|---|---|---|
| `01_codebase_inventory.md` | complete | Django 8-app map + 52 page components inventory |
| `02_context_and_extended_audit.md` | complete | TOC parity OK; stale bstock paths flagged |
| `03_initiatives_audit.md` | complete | One active initiative; archive TOC mismatch quantified |
| `04_version_changelog_audit.md` | complete | `.version` / `package.json` / top `CHANGELOG` aligned |
| `05_cleanup_and_restructure_audit.md` | complete | Debris + duplicate protocols + link debt |
| `PLAN.md` | complete | Machine-actionable items with ids |

## Cross-Cutting Risks

- **Link rot in historical `CHANGELOG` sections** — fixing every old link is high effort; acceptable to fix “entry points” (`README`, `context`, `consultant_context`, active docs) first — confidence: **Medium**
- **Uncommitted preprocessing / receiving work** — deep dive did not review behavioral correctness; reports describe **documentation and tree** integrity — confidence: **High**

## Recommended Next Step

1. Execute **`PLAN.md`** section **Immediate Safe Updates** (`SAFE-001`–`SAFE-003`) in one small PR-style pass with user approval for anything touching archive mechanics beyond TOC rows.
2. Batch-fix **bstock initiative** links in steering files (`CTX-002`).
3. Decide canonical location for **initiative lifecycle protocols** (`STRUCT-001`).

## Evidence Gaps

| Gap | Why unresolved | Follow-up needed |
|---|---|---|
| Full test coverage metrics | No centralized coverage report run | `pytest`/CI config + optional coverage job |
| Whether `files.zip` is intentional | Not opened; could be user artifact | User confirms keep/delete |
| Parity of `_protocols/*.md` file contents | Files not byte-compared | `fc` / diff if deduplicating trees |

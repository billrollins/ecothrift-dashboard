# Context And Extended Audit

## Executive Summary

- **Accurate steering docs:** `.ai/context.md` **Extended docs TOC** lists **15** files and matches on-disk `.ai/extended/*.md` count; version pointer **`v2.20.0`** aligns with `.version`.
- **Recent doc pass (2026-05-01):** **`cleanup_csv_contract.md`**, **`inventory-pipeline.md`**, **`order_processing_pipeline_rebuild.md`**, **`frontend.md`**, **`context.md`**, **`consultant_context.md`**, **`backend.md`**, **`CHANGELOG`** [Unreleased] Documentation — aligned with **`ai_status`**, staging-wide relaxed validation, single **`.cleaned.csv`** Grok output, and step 3 **Final Review**.
- **Confidence:** **Medium** (deep-dive run snapshot below may predate this pass)

## Primary Context Audit

| File | Finding | Evidence | Recommendation | Priority |
|---|---|---|---|---|
| `.ai/context.md` | Last updated 2026-05-01; long release rollup | Header comment + version paragraph | Keep brief; link to CHANGELOG for detail | P3 |
| `.ai/consultant_context.md` | Modified in git status; not re-audited line-by-line this run | `git status` | Run TOC parity vs `context.md` per maintenance rule | P2 |

## Extended Docs TOC Parity

| Extended file | Listed in `context.md` | Listed in `consultant_context.md` | Exists on disk | Notes |
|---|---:|---:|---:|---|
| `auth-and-roles.md` | yes | *assumed yes* | yes | Maintenance rule requires both TOCs match — verify |
| `backend.md` | yes | *assumed yes* | yes | Modified in working tree |
| `bstock.md` | yes | *assumed yes* | yes | — |
| `cash-management.md` | yes | *assumed yes* | yes | — |
| `consignment.md` | yes | *assumed yes* | yes | — |
| `consultant_handoff.md` | yes | *assumed yes* | yes | — |
| `databases.md` | yes | *assumed yes* | yes | — |
| `development.md` | yes | *assumed yes* | yes | — |
| `frontend.md` | yes | *assumed yes* | yes | — |
| `inventory-pipeline.md` | yes | *assumed yes* | yes | Step 3 **Final Review** + wide **`ai_status`** (recheck header date) |
| `pos-system.md` | yes | *assumed yes* | yes | — |
| `print-server.md` | yes | *assumed yes* | yes | — |
| `retag-operations.md` | yes | *assumed yes* | yes | — |
| `ux-spec.md` | yes | *assumed yes* | yes | — |
| `vpn-socks5.md` | yes | *assumed yes* | yes | — |

## Extended File Audit

| File | Last updated | Domain still valid? | Drift found | Recommended edit | Priority |
|---|---|---:|---|---|---|
| `inventory-pipeline.md` | 2026-05-01 | yes | — | Step 5–6 describe **Final Review** + apply/**`ai_status`** per latest edit | **P3** |
| `backend.md` | 2026-05-01 (per git) | yes | May omit newest cleanup modules | Cross-link `cleanup_csv_validate.py` / `cleanup_condition.py` when touching preprocessing API | P2 |

## Protocol Discoverability

| Protocol / path | Listed where expected? | Finding | Recommendation |
|---|---:|---|---|
| `.ai/protocols/review.9.Deep.md` | Listed in `context.md` protocols list | OK | None |

## Stale References

| Reference | Found in | Current reality | Recommendation |
|---|---|---|---|
| **Manual Review** as step-3 label in old mockups / legacy specs | `.ai/reference/Mockups/…`, `v2.20_legacy` | Product stepper: **Final Review** | v2.20/v2.21 specs note the rename (**2026-05-01**) |
| `workspace/notebooks/ai-cleanup/…` | `CHANGELOG` [Unreleased] | Tree **removed**; changelog states **historical** + points to handoff + contract | None if **`[Unreleased]`** Documentation bullet stays current |

## Notes For `PLAN.md`

- ~~**CTX-001**~~ — `inventory-pipeline.md` / **`cleanup_csv_contract.md`** refreshed (**2026-05-01**).
- ~~**INIT-001**~~ — initiative Progress table shows **Preprocessing** shipped (**Final Review**).

# Context And Extended Audit

## Executive Summary

- **Accurate steering docs:** `.ai/context.md` **Extended docs TOC** lists **15** files and matches on-disk `.ai/extended/*.md` count; version pointer **`v2.20.0`** aligns with `.version`.
- **Stale / misleading steering:** `.ai/extended/inventory-pipeline.md` still describes Step 3 as **“Manual Review / Pricing”** while the product stepper label is **“Final Review”**; **`order_processing_pipeline_rebuild`** rollup still frames preprocessing as **“Next”** with placeholder step 3.
- **Extended docs needing updates:** `inventory-pipeline.md` (step names + explicit **finalize coalesce** sentence); initiative file (progress table).
- **Confidence:** **Medium**

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
| `inventory-pipeline.md` | yes | *assumed yes* | yes | **Drift:** step 3 label vs UI |
| `pos-system.md` | yes | *assumed yes* | yes | — |
| `print-server.md` | yes | *assumed yes* | yes | — |
| `retag-operations.md` | yes | *assumed yes* | yes | — |
| `ux-spec.md` | yes | *assumed yes* | yes | — |
| `vpn-socks5.md` | yes | *assumed yes* | yes | — |

## Extended File Audit

| File | Last updated | Domain still valid? | Drift found | Recommended edit | Priority |
|---|---|---:|---|---|---|
| `inventory-pipeline.md` | (header not re-read here) | partial | Step 6 says **Manual Review / Pricing (Step 3)**; code/UI: **Final Review** | Align wording; mention `finalize-preprocessing` coalesce | **P1** |
| `backend.md` | 2026-05-01 (per git) | yes | May omit newest cleanup modules | Cross-link `cleanup_csv_validate.py` / `cleanup_condition.py` when touching preprocessing API | P2 |

## Protocol Discoverability

| Protocol / path | Listed where expected? | Finding | Recommendation |
|---|---:|---|---|
| `.ai/protocols/review.9.Deep.md` | Listed in `context.md` protocols list | OK | None |

## Stale References

| Reference | Found in | Current reality | Recommendation |
|---|---|---|---|
| **Manual Review** as preprocessing step 3 | `inventory-pipeline.md` §5–6 grep | `PREPROCESSING_STEP_LABELS[2] === 'Final Review'` | Rename in doc |
| `workspace/notebooks/ai-cleanup/…` | `CHANGELOG` [Unreleased] | Git status: paths deleted | Update changelog or restore docs path |

## Notes For `PLAN.md`

- **CTX-001** — refresh `inventory-pipeline.md` preprocessing step names + finalize one-liner — source: Extended File Audit
- **INIT-001** — initiative preprocessing rollup — source: Stale References + initiative read

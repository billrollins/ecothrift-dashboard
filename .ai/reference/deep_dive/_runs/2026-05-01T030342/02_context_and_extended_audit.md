# Context And Extended Audit

## Executive Summary

- **Accurate steering docs:** `.ai/context.md` version roll-up and file map match repo shape; Extended TOC in `context.md` lists **15** domain files that exist on disk; `.ai/consultant_context.md` Extended TOC matches the same set.
- **Stale / misleading:** Multiple references to **`.ai/initiatives/bstock_auction_intelligence.md`** (and relative `initiatives/bstock_auction_intelligence.md`) but the initiative file is **archived** at `.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`.
- **Extended docs:** Several timestamps **older than `v2.20.0` shipping** (`development.md` 2026-04-17, `consultant_handoff.md` 2026-04-16) — not automatically wrong, but **inventory inbound** narrative may be under-represented outside `frontend.md` / `inventory-pipeline.md`.
- **Confidence:** **High** for TOC parity; **High** for bstock path staleness (ripgrep + file check).

## Primary Context Audit

| File | Finding | Evidence | Recommendation | Priority |
|---|---|---|---|---|
| `.ai/context.md` | Buying Phase 6 link targets **non-existent** root path | Line ~118: `(initiatives/bstock_auction_intelligence.md)` — file is under `_archived/_completed/` | Update link to archived path + note “archived initiative” | P1 |
| `.ai/consultant_context.md` | Same path error in opening maintenance paragraph | Line 7: `` `initiatives/bstock_auction_intelligence.md` `` | Same | P1 |
| `.ai/context.md` | Protocol list in file map includes `review.9.Deep` | Line 43 | OK | — |

## Extended Docs TOC Parity

| Extended file | Listed in `context.md` | Listed in `consultant_context.md` | Exists on disk | Notes |
|---|---:|---:|---:|---|
| `auth-and-roles.md` | yes | yes | yes | |
| `backend.md` | yes | yes | yes | |
| `bstock.md` | yes | yes | yes | |
| `cash-management.md` | yes | yes | yes | |
| `consignment.md` | yes | yes | yes | |
| `consultant_handoff.md` | yes | yes | yes | |
| `databases.md` | yes | yes | yes | |
| `development.md` | yes | yes | yes | |
| `frontend.md` | yes | yes | yes | |
| `inventory-pipeline.md` | yes | yes | yes | |
| `pos-system.md` | yes | yes | yes | |
| `print-server.md` | yes | yes | yes | |
| `retag-operations.md` | yes | yes | yes | |
| `ux-spec.md` | yes | yes | yes | |
| `vpn-socks5.md` | yes | yes | yes | |

**Count:** **15** extended domain files; each is listed in both TOCs and exists on disk.

## Extended File Audit

| File | Last updated (header) | Domain still valid? | Drift found | Recommended edit | Priority |
|---|---|---:|---|---|---|
| `auth-and-roles.md` | 2026-03-30 | yes | — | none | P3 |
| `backend.md` | 2026-04-28 | yes | may omit newest migration detail | touch when merging inventory work | P2 |
| `bstock.md` | 2026-04-21 | yes | links to old initiative path in other files | fix cross-links | P1 |
| `cash-management.md` | 2026-02-13 | yes | stale date only | optional bump if POS work | P3 |
| `consignment.md` | 2026-02-13 | yes | — | optional | P3 |
| `consultant_handoff.md` | 2026-04-16 | partial | bstock initiative path | fix path | P1 |
| `databases.md` | 2026-04-16 | yes | — | none | P3 |
| `development.md` | 2026-04-17 | yes | Heroku table may need sync if commands changed | verify vs `scripts/dev/*.bat` | P2 |
| `frontend.md` | 2026-04-29 | yes | — | keep aligned with App routes | P2 |
| `inventory-pipeline.md` | 2026-04-29 | yes | WIP preprocessing | update after UX stabilizes | P2 |
| `pos-system.md` | 2026-04-06 | yes | — | optional | P3 |
| `print-server.md` | 2026-04-16 | yes | — | none | P3 |
| `retag-operations.md` | 2026-04-10 | historical | marked unknown in consultant_context | none | P3 |
| `ux-spec.md` | 2026-04-17 | yes | buying-heavy; inventory inbound patterns emerging | extend when preprocessing UX final | P2 |
| `vpn-socks5.md` | 2026-04-16 | yes | link to `../initiatives/bstock_auction_intelligence.md` broken | fix | P1 |

## Protocol Discoverability

| Protocol / path | Listed where expected? | Finding | Recommendation |
|---|---:|---|---|
| `.ai/protocols/code.0.Startup.md` | `context.md`, `README.md` | OK | — |
| `.ai/protocols/review.9.Deep.md` | `README.md`, `context.md` Quick Ref | OK | — |
| `.ai/protocols/session.0.Create.md` | `README.md` | Marked placeholder in `code.0.Startup` | OK — intentional |
| Deep dive output `.ai/reference/deep_dive/latest/` | `review.9.Deep.md` only (meta) | New layout — not in `README` table explicitly | Optional one-line in README AI table | P3 |
| `.ai/initiatives/_protocols/*.md` | `ARCHIVE.md` points to `_archived/_protocols` | **Duplicate** copy at initiatives root | Consolidate (see PLAN `STRUCT-001`) | P2 |

## Stale References

| Reference | Found in | Current reality | Recommendation |
|---|---|---|---|
| `.ai/initiatives/bstock_auction_intelligence.md` | `README.md`, `context.md`, `consultant_context.md`, `vpn-socks5.md`, `ui_ux_polish` (archived), old `CHANGELOG` anchors | File at `.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md` | Update “entry point” docs; optional mass `CHANGELOG` fix |
| `initiatives/bstock_auction_intelligence.md` (relative) | `.ai/context.md` | Broken relative URL from repo root `.ai/` | Fix to `_archived/_completed/…` |
| `.ai/personas/*.md` | Historical `CHANGELOG` ~2.15.x | **Personas removed** per `context.md` | Leave history; fix only if misleading in top docs |

## Notes For `PLAN.md`

- `CTX-001`–`CTX-003`: fix bstock paths + optional README deep-dive line
- `STRUCT-001`: duplicate `_protocols` trees

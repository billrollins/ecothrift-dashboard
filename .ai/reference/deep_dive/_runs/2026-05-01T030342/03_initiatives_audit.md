# Initiatives Audit

## Executive Summary

- **Active initiatives:** Single row in `_index.md` — **`order_processing_pipeline_rebuild`** — file present, session history through v2.20.0; **Preprocessing** marked next — aligns with git WIP on preprocessing components.
- **Archive/index:** **`.ai/initiatives/_archived/ARCHIVE.md`** `_completed` TOC lists **14** rows; **`_archived/_completed/`** contains **16** `*.md` files — **missing from TOC:** `bstock_auction_intelligence.md`, `ui_ux_polish.md`. Other buckets’ row counts match file counts (`_backlog` 4, `_pending` 5, `_abandoned` 1).
- **Recommended dispositions:** No initiative **moves** recommended in this audit; only **index/TOC repair** and **link hygiene** (requires user approval per protocol for any `git mv`).
- **Confidence:** **High** for counts; **High** for active initiative health snapshot.

## Active / Root Initiative Index

| Initiative | Listed status | File status | Current phase | Evidence | Finding | Recommendation |
|---|---|---|---|---|---|---|
| `order_processing_pipeline_rebuild` | active | exists | Orders + Receiving shipped; Preprocessing next | `_index.md`, initiative file Progress table | Aligns with `CHANGELOG [2.20.0]` | Continue in initiative file; no archive |

**Root `.ai/initiatives/*.md` (non-archived):** besides `_index.md`, **`order_processing_pipeline_rebuild.md`** only — consistent with “single active initiative” model.

## Initiative File Health

| File | Has session log? | Latest session/result | Acceptance boxes current? | Drift | Priority |
|---|---|---|---|---|---|
| `order_processing_pipeline_rebuild.md` | yes | Through Session 5 / v2.20.0 ship | partial (Preprocessing in flight) | Preprocessing “next” vs code WIP | P2 — refresh after Session 6 |

## Archive Consistency

| Bucket | File count (disk) | `ARCHIVE.md` rows | Mismatches | Recommendation |
|---|---:|---:|---|---|
| `_completed` | 16 | 14 | **Missing TOC rows:** `bstock_auction_intelligence.md`, `ui_ux_polish.md` | Add two TOC rows + summaries + dates |
| `_backlog` | 4 | 4 | none | — |
| `_pending` | 5 | 5 | none | — |
| `_abandoned` | 1 | 1 | none | — |

## Recommended Dispositions

Do not move files during reporting. Put approved moves through `.ai/initiatives/_archived/_protocols/`.

| Initiative | Recommended disposition | Lifecycle protocol | Reason | Requires user approval |
|---|---|---|---|---|
| *(none this run)* | — | — | No evidence that active initiative is complete or should be parked | — |
| `bstock_auction_intelligence` | **Remain** `_completed` | none | Already archived; only **TOC** repair needed | **no** for TOC edit; **yes** if moving files |

## Initiative Gaps

| Gap | Evidence | Recommended new / merged initiative | Priority |
|---|---|---|---|
| Buying roadmap after Phase 5 | Phases 1–5 done; Phase 6 in `context.md` “Not Yet Implemented” | Keep narrative in `consultant_context.md` + `bstock.md`; optional lightweight “Phase 6” stub initiative **only if** user wants separate tracking | P3 |
| Duplicate lifecycle protocols | Two identical trees | Tracking as **restructure** not initiative | P2 |

## Notes For `PLAN.md`

- `SAFE-002`: patch `ARCHIVE.md` TOC
- `INIT-*`: no moves; approval column N/A except user-driven backlog

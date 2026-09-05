# Initiatives Audit

## Executive Summary

- **Active initiatives health:** **`order_processing_pipeline_rebuild`** — Progress table lists **Preprocessing** **Shipped (core)** with Step 3 **Final Review** (**2026-05-01** refresh).
- **Archive/index consistency:** **`_archived/_completed`** has **16** `.md` files; **`ARCHIVE.md`** TOC lists matching completed entries (spot-check: 16).
- **Recommended dispositions:** **None** that require moves — ongoing doc parity via **`cleanup_csv_contract.md`** + pipeline.
- **Confidence:** **Medium** (report snapshot may predate minor follow-up edits)

## Active / Root Initiative Index

| Initiative | Listed status | File status | Current phase | Evidence | Finding | Recommendation |
|---|---|---|---|---|---|---|
| Order / Processing pipeline rebuild | Active | exists | **Preprocessing** core shipped | [`order_processing_pipeline_rebuild.md`](../../../initiatives/order_processing_pipeline_rebuild.md) Progress L31–39; [`PreprocessingStepper.tsx`](../../../../frontend/src/components/inventory/preprocessing/PreprocessingStepper.tsx) | Rollup matches **Final Review** + cleanup apply | Keep **`cleanup_csv_contract`** linked from Step 2 |

## Initiative File Health

| File | Has session log? | Latest session/result | Acceptance boxes current? | Drift | Priority |
|---|---|---|---|---|---|
| `order_processing_pipeline_rebuild.md` | yes (sessions in file) | Session 6 complete | yes (core path) | — | **P3** |

## Archive Consistency

| Bucket | File count | `ARCHIVE.md` rows | Mismatches | Recommendation |
|---|---:|---:|---|---|
| `_completed` | 16 | 16 (TOC list) | none spotted | Re-verify on add/remove |
| `_pending` | not enumerated | — | — | — |
| `_backlog` | not enumerated | — | — | — |
| `_abandoned` | not enumerated | — | — | — |

## Recommended Dispositions

Do not move files during reporting. Put approved moves through `.ai/initiatives/_archived/_protocols/`.

| Initiative | Recommended disposition | Lifecycle protocol | Reason | Requires user approval |
|---|---|---|---|---|
| `order_processing_pipeline_rebuild` | stay **active**; **edit** progress prose only | none | Scope still evolving (standard manifest / buckets) | **no** for text edits; **yes** if archiving |

## Initiative Gaps

| Gap | Evidence | Recommended new / merged initiative | Priority |
|---|---|---|---|
| Single doc for **cleanup CSV contract** (headers, wide vs narrow, error codes) | Spread across code + handoff markdown | Optional short reference under `.ai/reference/` | P3 |

## Notes For `PLAN.md`

- **INIT-001** — update initiative Progress table for preprocessing — source: Active Initiative Index
- **RESEARCH-001** — whether “Manual Review” route remains for post-finalize only — source: `views.py` `manual_review`

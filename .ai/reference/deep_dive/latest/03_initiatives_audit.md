# Initiatives Audit

## Executive Summary

- **Active initiatives health:** **`order_processing_pipeline_rebuild`** is active and recently touched (2026-05-01 header) but its **Progress rollup** under-describes shipped preprocessing UI (stepper shows **Final Review**; file still says Preprocessing **“Next”** with placeholder Step 3).
- **Archive/index consistency:** **`_archived/_completed`** has **16** `.md` files; **`ARCHIVE.md`** TOC lists matching completed entries (spot-check: 16).
- **Recommended dispositions:** **None** that require moves during this report — update content in place after user approval for initiative edits.
- **Confidence:** **Medium**

## Active / Root Initiative Index

| Initiative | Listed status | File status | Current phase | Evidence | Finding | Recommendation |
|---|---|---|---|---|---|---|
| Order / Processing pipeline rebuild | Active | exists | Narrative “Preprocessing — Next” | [`order_processing_pipeline_rebuild.md`](../../../initiatives/order_processing_pipeline_rebuild.md) Progress table L31–39; [`PreprocessingStepper.tsx`](../../../../frontend/src/components/inventory/preprocessing/PreprocessingStepper.tsx) | Rollup lags **Final Review** + three-layer staging | Edit Progress / Preprocessing sections; no file move |

## Initiative File Health

| File | Has session log? | Latest session/result | Acceptance boxes current? | Drift | Priority |
|---|---|---|---|---|---|
| `order_processing_pipeline_rebuild.md` | yes (sessions in file) | 2026-05-01 adjunct note | partial | **Step 3 described as placeholder** in rollup | **P1** |

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

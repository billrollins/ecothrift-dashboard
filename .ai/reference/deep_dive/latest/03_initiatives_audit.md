# Initiatives Audit

## Executive Summary

- **Active initiatives:** **One** row on `_index.md`: **`order_processing_pipeline_rebuild`** (preprocessing core shipped; Final Review visual rebuild still tracked against mockup/directive docs).
- **Archive health:** **`ARCHIVE.md`** TOC row counts match **on-disk** archived markdown files per bucket (`_completed` **16**, `_pending` **5**, `_backlog` **4**, `_abandoned` **1**).
- **Initiatives `_protocols` stub:** `.ai/initiatives/_protocols/README.md` explicitly points canonical lifecycle docs to **`_archived/_protocols/`** (“stub so duplicate copies do not drift”) — **not** an archive mismatch.
- **Confidence:** **High** for index vs archive consistency; **Medium** for initiative session-log freshness without reading full `order_processing_pipeline_rebuild.md` history end-to-end.

## Active / Root Initiative Index

| Initiative | Listed status | File status | Current phase | Evidence | Finding | Recommendation |
|------------|---------------|-------------|---------------|----------|---------|----------------|
| `order_processing_pipeline_rebuild` | Active (`_index.md`) | Exists at `.ai/initiatives/order_processing_pipeline_rebuild.md` | Iteration / UI polish | `_index.md`, `CHANGELOG [Unreleased]` | Core APIs shipped; Final Review visuals still tied to directive stack | Keep active until user accepts mockup-complete UI + release notes |

## Initiative File Health

| File | Has session log? | Latest session/result | Acceptance boxes current? | Drift | Priority |
|------|------------------|------------------------|---------------------------|-------|----------|
| `order_processing_pipeline_rebuild.md` | yes (`## Sessions`) | Sessions reference preprocessing + processor workspace + Final Review | partial (visual pass pending per `CHANGELOG`) | Docs split across `.ai/reference/*` | **P1** |

## Archive Consistency

| Bucket | File count | `ARCHIVE.md` rows | Mismatches | Recommendation |
|--------|------------|-------------------|------------|----------------|
| `_completed` | 16 | 16 | none observed | Keep current |
| `_pending` | 5 | 5 | none observed | Keep current |
| `_backlog` | 4 | 4 | none observed | Keep current |
| `_abandoned` | 1 | 1 | none observed | Keep current |

## Recommended Dispositions

**Do not move files during reporting.**

| Initiative | Recommended disposition | Lifecycle protocol | Reason | Requires user approval |
|------------|-------------------------|--------------------|--------|------------------------|
| `order_processing_pipeline_rebuild` | **Active** | none until scope complete | Still driving Final Review visuals + unreleased changelog mass | no |

## Initiative Gaps

| Gap | Evidence | Recommended new / merged initiative | Priority |
|-----|----------|-------------------------------------|----------|
| Buying Phase 6 outcomes | `context.md` Known Issues / roadmap; archived `bstock_auction_intelligence.md` | Reactivate narrow initiative only when scheduling work | **P2** |
| Cross-cutting AI provider config | `CHANGELOG [Unreleased]` (`AI_PROVIDER`, xAI) | Stay under current initiative until user splits AI infra | **P3** |

## Notes For `PLAN.md`

- Optional **P3**: If the stub folder confuses contributors, add one line to **`_index.md`** linking canonical protocols path — source: stub README under **`initiatives/_protocols/`**.

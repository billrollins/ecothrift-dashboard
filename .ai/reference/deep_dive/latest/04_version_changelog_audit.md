# Version And Changelog Audit

## Executive Summary

- **Version alignment:** **Aligned** among `.version`, root `package.json`, and latest dated `CHANGELOG` section **`[2.20.0]`**.
- **Changelog state:** Large, meaningful **`[Unreleased]`** capturing inventory processor workspace, LLM provider routing, preprocessing CSV contract updates, and documentation pointers — **needs intentional release slicing** before the next tag.
- **`frontend/package.json`:** **`0.0.0`** — intentional per recent bump notes in `CHANGELOG` / steering (SPA not individually versioned like the repo).
- **Confidence:** **High** for alignment table; **Medium** for SemVer bump recommendation until user declares release scope.

## Version Alignment

| Artifact | Value | Expected | Status | Notes |
|----------|-------|----------|--------|-------|
| `.version` | `v2.20.0` | `vMAJOR.MINOR.PATCH` | ok | Single-line semver file |
| Root `package.json` | `2.20.0` | numeric match without `v` | ok | Heroku/node harness |
| `frontend/package.json` | `0.0.0` | independent | ok | Documented as unchanged in steering |
| Top dated `CHANGELOG` section | `[2.20.0]` | matches shipped `.version` | ok | `[Unreleased]` sits above it |

## Changelog Structure

| Check | Status | Evidence | Recommendation |
|-------|--------|----------|----------------|
| Newest release first | ok | `## [Unreleased]` then `## [2.20.0]` | Keep pattern |
| `[Unreleased]` meaningful | ok | Extensive Added/Changed for inventory | Split into next dated section when releasing |
| Duplicate release headers | not audited exhaustively | Sample read shows single `[2.20.0]` | Run quick grep before release |
| Keep a Changelog sections | ok | Added / Changed / Fixed / Documentation | Continue |

## Release Traceability

| Release / Unreleased theme | Initiative / hotfix link | Evidence | Gap | Recommendation |
|----------------------------|---------------------------|----------|-----|------------------|
| `[Unreleased]` Item Processor + LLM | `order_processing_pipeline_rebuild`, steering refs | `CHANGELOG` lines ~23–52 | Not yet tied to a semver tag | User approves bump + section migration (`session.9.Close.md`) |
| `[2.20.0]` Receiving + PO dashboard | Same initiative / inbound theme | `CHANGELOG` `[2.20.0]` | none | Already shipped |

## SemVer Findings

| Finding | Evidence | Recommended bump? | Reason | Requires user approval |
|---------|----------|-------------------|--------|------------------------|
| Large additive API + UI surface in `[Unreleased]` | `processing-workspace`, processor POST actions, migrations `0039` | **minor** (typical) | User-visible inventory capability expansion | **yes** |
| AI provider env keys | `XAI_API_KEY`, `AI_PROVIDER` | **patch** if treated as ops-only | Could argue minor if staff-facing AI controls expanded | **yes** |

## Notes For `PLAN.md`

- **`REL-001`**: Schedule **`review.0.Bump`** + `session.9.Close.md` Part 2 when user freezes `[Unreleased]` scope — source: § Changelog Structure.

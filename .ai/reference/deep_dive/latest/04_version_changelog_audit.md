# Version And Changelog Audit

## Executive Summary

- **Version alignment:** **Aligned** among `.version` (`v2.20.0`), root `package.json` (`2.20.0`), and latest **dated** `CHANGELOG` release **`[2.20.0]`**.
- **Changelog state:** Substantial **`[Unreleased]`** block documents preprocessing three-layer model, LLM routing, cleanup CSV export shape, and env keys — **high value**.
- **Release traceability:** `[Unreleased]` ties items to concrete files; some **Documentation** bullets may reference paths absent from the working tree (notebooks).
- **Confidence:** **High** for version matrix; **Medium** for doc-path accuracy inside `[Unreleased]`.

## Version Alignment

| Artifact | Value | Expected | Status | Notes |
|---|---|---|---|---|
| `.version` | `v2.20.0` | `vMAJOR.MINOR.PATCH` | ok | no leading-v inconsistency in file |
| `package.json` (root) | `2.20.0` | `.version` without `v` | ok | matches |
| `frontend/package.json` | `0.0.0` | independent | ok | per template expectation |
| top `CHANGELOG.md` release | `[2.20.0]` then `[Unreleased]` | matches `.version` for shipped | ok | unreleased work not yet tagged |

## Changelog Structure

| Check | Status | Evidence | Recommendation |
|---|---|---|---|
| Newest release first | ok | `[Unreleased]` then `[2.20.0]` | Keep; tag release when ready |
| `[Unreleased]` meaningful | ok | Multiple substantive bullets | Split into Added/Changed/Docs cleanly (already mostly is) |
| No duplicate release headers | ok (not exhaustively scanned older file) | — | — |
| Section keywords | ok | Added / Changed / Documentation | — |

## Release Traceability

| Release / Unreleased item | Initiative / hotfix link | Evidence | Gap | Recommendation |
|---|---|---|---|---|
| Three-layer `PreprocessingRow` | Initiative + extended docs cited | [`CHANGELOG.md`](../../../../CHANGELOG.md) L21 | Initiative rollup lag | Align initiative |
| `llm_chat_completion_text` / `AI_PROVIDER` | Env + settings | CHANGELOG L17–23 | — | — |
| Notebook path under `workspace/notebooks/ai-cleanup/` | Docs bullet | CHANGELOG L30 | **git: deleted** | Update changelog or restore tree |

## SemVer Findings

| Finding | Evidence | Recommended bump? | Reason | Requires user approval |
|---|---|---|---|---|
| Large unreleased inventory/preprocessing feature set | Branch diff + CHANGELOG `[Unreleased]` | **minor** when releasing (e.g. 2.21.0) | User-visible flow + models | **yes** |
| Docs-only fixes after release | — | patch | — | **yes** |

## Notes For `PLAN.md`

- **REL-001** — reconcile `[Unreleased]` notebook documentation with repo tree — source: Release Traceability row
- **REL-002** — on release, bump `.version` + root `package.json` + dated section — source: SemVer Findings (requires user approval per protocol)

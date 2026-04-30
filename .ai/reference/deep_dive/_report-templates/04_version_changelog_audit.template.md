# Version And Changelog Audit - Template

## Executive Summary

- Version alignment: `<aligned / drift + notes>`
- Changelog state: `<current + issues>`
- Release traceability: `<good / gaps>`
- Confidence: `<High / Medium / Low>`

## Version Alignment

| Artifact | Value | Expected | Status | Notes |
|---|---|---|---|---|
| `.version` | `<value>` | `vMAJOR.MINOR.PATCH` | `<ok/drift>` | `<notes>` |
| `package.json` | `<value>` | `.version` without `v` | `<ok/drift>` | `<notes>` |
| `frontend/package.json` | `<value>` | independent, usually `0.0.0` | `<ok/drift>` | `<notes>` |
| top `CHANGELOG.md` release | `<value>` | matches `.version` unless `[Unreleased]` only | `<ok/drift>` | `<notes>` |

## Changelog Structure

| Check | Status | Evidence | Recommendation |
|---|---|---|---|
| Newest release first | `<ok/drift>` | `<refs>` | `<action>` |
| `[Unreleased]` meaningful if present | `<ok/drift>` | `<refs>` | `<action>` |
| No duplicate release headers | `<ok/drift>` | `<refs>` | `<action>` |
| Sections use Added/Changed/Fixed/Removed/Documentation as needed | `<ok/drift>` | `<refs>` | `<action>` |

## Release Traceability

| Release / Unreleased item | Initiative / hotfix link | Evidence | Gap | Recommendation |
|---|---|---|---|---|
| `<version/item>` | `<initiative/hotfix/none>` | `<refs>` | `<gap>` | `<action>` |

## SemVer Findings

| Finding | Evidence | Recommended bump? | Reason | Requires user approval |
|---|---|---|---|---|
| `<finding>` | `<refs>` | `<none/patch/minor/major>` | `<why>` | `yes/no` |

## Notes For `PLAN.md`

- `<plan item candidate>` - source: `<section/table row>`


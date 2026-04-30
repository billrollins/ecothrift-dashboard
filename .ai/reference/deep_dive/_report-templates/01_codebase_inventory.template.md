# Codebase Inventory - Template

## Executive Summary

- Current shipped product shape: `<1-5 bullets>`
- Major code surfaces: `<backend/frontend/scripts/ops bullets>`
- Highest-risk drift areas: `<bullets>`
- Confidence: `<High / Medium / Low>`

## Repo Map

| Path | Purpose | Current notes | Risk |
|---|---|---|---|
| `apps/<app>/` | `<purpose>` | `<state>` | `<none/low/medium/high>` |
| `frontend/src/<area>/` | `<purpose>` | `<state>` | `<none/low/medium/high>` |

## Backend Inventory

| App | Models | API surfaces | Management commands | Migrations state | Tests | Notes |
|---|---|---|---|---|---|---|
| `<app>` | `<key models>` | `<routes/viewsets>` | `<commands>` | `<latest + anomalies>` | `<test files>` | `<notes>` |

## Frontend Inventory

| Domain | Routes / pages | API hooks | Components | Types | Tests | Notes |
|---|---|---|---|---|---|---|
| `<domain>` | `<routes>` | `<hooks/api>` | `<components>` | `<types>` | `<tests>` | `<notes>` |

## Scripts / Ops Inventory

| Path | Purpose | Safe to run? | External effects | Notes |
|---|---|---|---|---|
| `<script>` | `<purpose>` | `<yes/no/conditional>` | `<none/db/api/deploy>` | `<notes>` |

## Shipped Behavior Snapshot

| Capability | Evidence | AI docs that should mention it | Drift? |
|---|---|---|---|
| `<capability>` | `<code/changelog refs>` | `<doc refs>` | `<yes/no>` |

## Test Coverage Gaps

| Area | Existing coverage | Missing coverage | Risk |
|---|---|---|---|
| `<area>` | `<files>` | `<gap>` | `<low/medium/high>` |

## Open Questions

- `<question>` - evidence needed: `<file/command/person>`


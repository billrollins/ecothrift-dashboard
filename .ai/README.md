# AI steering (`.ai/`)

How agents navigate this repo. **Semver and release history live only at the repo root** — [`.version`](../.version) and [`CHANGELOG.md`](../CHANGELOG.md).

## Session startup (default)

1. [`.ai/context.md`](context.md) — product compass (not a changelog)
2. Repo root [`.version`](../.version)
3. Top of [`CHANGELOG.md`](../CHANGELOG.md) (latest dated section + `[Unreleased]` if present)
4. [`.ai/initiatives/_index.md`](initiatives/_index.md) — active work
5. Active initiative file(s) under [`.ai/initiatives/`](initiatives/) — **the plan** (scope, execution steps, sessions)

Protocol detail: [`.ai/protocols/code.0.Startup.md`](protocols/code.0.Startup.md)

## Load on demand

| Path | When |
|------|------|
| [`.ai/extended/<domain>.md`](extended/) | Domain behavior (inventory, POS, buying, …) |
| [`.ai/reference/`](reference/) | Purpose-specific artifacts (see [`reference/README.md`](reference/README.md)) |
| [`.ai/protocols/`](protocols/) | Bump, push, deep dive, session close, SQL schema update |

## What lives where

| Location | Role |
|----------|------|
| **`.ai/initiatives/`** | Bounded work: one file per initiative = plan + sessions + acceptance |
| **`.ai/extended/`** | Deep domain docs + [`extended/sql/`](extended/sql/README.md) |
| **`.ai/reference/`** | Supporting files grouped by purpose (intake SQL, Final Review specs, deep-dive output) |
| **`.ai/protocols/`** | Agent workflows |

## Not in `.ai`

- **Plans** — no `.ai/plans/`; use initiative files only
- **Version narrative** — do not duplicate `CHANGELOG` in `context.md`
- **`consultant_context.md`** — removed; use `context.md` + initiatives + root changelog

## Deep research

Full steering audit: [`.ai/protocols/review.9.Deep.md`](protocols/review.9.Deep.md) → output under [`.ai/reference/deep_dive/latest/`](reference/deep_dive/latest/).

# AI steering (`.ai/`)

How agents navigate this repo. **Semver and release history live only at the repo root** — [`.version`](../.version) and [`CHANGELOG.md`](../CHANGELOG.md).

## Load context (default)

Protocol: [`.ai/protocols/load-context.md`](protocols/load-context.md)

1. [`.ai/context.md`](context.md) — product compass
2. Repo root [`.version`](../.version)
3. Top of [`CHANGELOG.md`](../CHANGELOG.md)
4. [`.ai/initiatives/_index.md`](initiatives/_index.md)
5. Active initiative file(s)

Then ask what is needed. No session block.

## What lives where

| Location | Role |
|----------|------|
| **`.ai/context.md`** | Compass — not a changelog |
| **`.ai/initiatives/`** | Bounded work: one file per initiative (plan + acceptance) |
| **`.ai/extended/`** | Domain docs, on demand + [`extended/sql/`](extended/sql/README.md) |
| **`.ai/reference/`** | TARS design/canon + bookkeeping recon |
| **`.ai/protocols/`** | `load-context`, `ship`, `initiative`, `sql-schema` |

## Not in `.ai`

- Session start / checkpoint / close rituals — removed 2026-08-13
- Version narrative — do not duplicate `CHANGELOG` in `context.md`
- `efforts/`, `.ai/plans/`, `consultant_context.md` — gone

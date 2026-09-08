# AI steering (`.ai/`)

How agents navigate this repo. **Semver and release history live only at the repo root** — [`.version`](../.version) and [`CHANGELOG.md`](../CHANGELOG.md).

## Protocols

A protocol is a trigger. **IF** it is `@`-mentioned **THEN** do only what that file says.

| File | Trigger |
|------|---------|
| [`clean-up.md`](protocols/clean-up.md) | List junk; delete only what they paste back |
| [`context-load.md`](protocols/context-load.md) | Orient, then ask |
| [`check_comm.md`](protocols/check_comm.md) | Pickup parent inbox / write outbox |
| [`initiative-create.md`](protocols/initiative-create.md) | Interview, then write a full initiative file |
| [`initiative-review.md`](protocols/initiative-review.md) | Reconcile files with what shipped; you approve moves |
| [`ship-push-git.md`](protocols/ship-push-git.md) | Docs, version, changelog, commit, GitHub |
| [`ship-push-heroku.md`](protocols/ship-push-heroku.md) | Same as git, then Heroku |
| [`ship-print-server.md`](protocols/ship-print-server.md) | Build/upload print server; Settings download; install this PC |

Lifecycle after create: [`extended/initiatives.md`](extended/initiatives.md). Schema refresh: [`extended/sql/README.md`](extended/sql/README.md).

## What lives where

| Location | Role |
|----------|------|
| **`.ai/context.md`** | Compass — not a changelog |
| **`.ai/comm/`** | Parent master AI — `inbox.md` from master, `outbox.md` to master (replace after read) |
| **`.ai/initiatives/`** | Bounded work: one file per initiative (plan + acceptance) |
| **`.ai/extended/`** | Domain docs, on demand + [`extended/sql/`](extended/sql/README.md) |
| **`.ai/reference/`** | TARS design/canon + bookkeeping recon |
| **`.ai/protocols/`** | `clean-up`, `context-load`, `check_comm`, `initiative-create`, `initiative-review`, `ship-push-git`, `ship-push-heroku`, `ship-print-server` |

## Not in `.ai`

- Session start / checkpoint / close rituals — removed 2026-08-13
- Version narrative — do not duplicate `CHANGELOG` in `context.md`
- `efforts/`, `.ai/plans/`, `consultant_context.md` — gone

<!-- Last updated: 2026-08-13 (replaced code.0.Startup; no session block) -->
# Protocol: Load context

How to begin work on this repo. Invoke with `@.ai/protocols/load-context.md`.

## Read

1. [`.ai/context.md`](../context.md) — product compass.
2. Repo root [`.version`](../../.version).
3. Top of [`CHANGELOG.md`](../../CHANGELOG.md) (latest dated section + `[Unreleased]` if present).
4. [`.ai/initiatives/_index.md`](../initiatives/_index.md) — active work.
5. The **active** initiative file(s) listed there. Do not read `_archived/` unless the task is archive work.

Then glance at open terminals (Django / Vite already running?).

## Then

Ask what the user needs. Do not assume the task. Do not write a session block, framing questions, checkpoint, or close ritual.

If the work is substantial and no active initiative fits, stop and ask whether to create one ([`initiative.md`](initiative.md)).

## Load on demand

| Path | When |
|------|------|
| [`.ai/extended/<domain>.md`](../extended/) | Domain behavior — pick from the Extended TOC in `context.md` |
| [`.ai/reference/tars/`](../reference/tars/) | TARS design / canon / audit register |
| [`ship.md`](ship.md) | User asked to bump, commit, push, or deploy |
| [`sql-schema.md`](sql-schema.md) | Refresh `schema.csv` |

Do **not** read every extended file. Do **not** run migrations, seeds, or builds unless asked. Do **not** commit or push unless asked.

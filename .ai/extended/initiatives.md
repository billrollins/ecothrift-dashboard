<!-- Last updated: 2026-08-27 (protocol names category-first) -->
# Initiatives

Bounded work (hours–days). One `.md` under [`.ai/initiatives/`](../initiatives/) plus a row on [`_index.md`](../initiatives/_index.md). Not a session log. Compass: [`.ai/context.md`](../context.md) **Active work**.

**Human gate:** do not move a file into `_archived/` unless the user explicitly approves.

## Layout

| Place | Meaning |
|-------|---------|
| `.ai/initiatives/<name>.md` | Active (or draft not yet listed) |
| `_archived/_pending/` | Paused, not finished |
| `_archived/_backlog/` | Future / not started |
| `_archived/_completed/` | Scope delivered |
| `_archived/_abandoned/` | Will not pursue |

Same pass always updates `_index.md` and [`ARCHIVE.md`](../initiatives/_archived/ARCHIVE.md). Fix relative links after a path-depth change. Bump both `<!-- Last updated -->`. **IF** Active work on `context.md` is now wrong **THEN** fix it. File moves alone do not bump semver.

## Create

**IF** the user attaches [`.ai/protocols/initiative-create.md`](../protocols/initiative-create.md) **THEN** run that protocol (interview, then write).

Otherwise:

1. Add `.ai/initiatives/<descriptive_snake_name>.md` — objective, finish line, phases, acceptance, `## Record`.
2. Add a row to **Active** on `_index.md`.
3. Point `context.md` **Active work** at it if it is now the compass.

## Review (stale files)

**IF** the user attaches [`.ai/protocols/initiative-review.md`](../protocols/initiative-review.md) **THEN** run that protocol (propose dispositions, then apply the paste-back).

## Activate (archive → root)

`git mv .ai/initiatives/_archived/_<bucket>/<name>.md .ai/initiatives/<name>.md`

Write a reactivation note on the file. Add the `_index.md` row. Remove the `ARCHIVE.md` TOC row.

## Park → pending

Paused, not finished. Record what would resume it.

`git mv .ai/initiatives/<name>.md .ai/initiatives/_archived/_pending/<name>.md`

Archive comment: `<!-- Archived YYYY-MM-DD: disposition=pending … -->`. Remove from Active. Add `ARCHIVE.md` **Pending** row.

## Park → backlog

Future / not started. Same move into `_backlog/`. `ARCHIVE.md` **Backlog** row.

## Complete

Scope delivered (~100%). Tie shipped work to `CHANGELOG.md` when code actually shipped.

`git mv` into `_completed/`. Archive comment with what shipped (optional version). Remove from Active. Add `ARCHIVE.md` **Completed** row (or the Completed name list on `_index.md`).

## Abandon

Will not pursue. Keep the file. One-line **why** on the `ARCHIVE.md` row.

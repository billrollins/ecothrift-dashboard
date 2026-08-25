<!-- Last updated: 2026-08-13 (collapsed five lifecycle protocols; human gate unchanged) -->
# Protocol: Initiative lifecycle

Bounded work: one `.md` under [`.ai/initiatives/`](../initiatives/) plus a row in [`_index.md`](../initiatives/_index.md). Not a session log.

**Human gate:** do not move a file into `_archived/` unless the user explicitly approves.

Always update **`_index.md`** and **[`ARCHIVE.md`](../initiatives/_archived/ARCHIVE.md)** in the **same pass**. Fix relative links after a path-depth change. Bump both files' `<!-- Last updated -->`. Align `.ai/context.md` if the compass is now wrong. No semver bump for initiative-file moves alone.

---

## Create

1. Add `.ai/initiatives/<descriptive_snake_name>.md` — objective, finish line, acceptance, optional `## Record`.
2. Add a row to **Active** on `_index.md`.
3. Point `.ai/context.md` **Active work** at it if it is now the compass.

## Activate (archive → root)

`git mv .ai/initiatives/_archived/_<bucket>/<name>.md .ai/initiatives/<name>.md`

Reactivation note on the file. Add the `_index.md` row. Remove the `ARCHIVE.md` TOC row.

## Park → pending (`_archived/_pending/`)

Paused, not finished. Record what would resume it.

`git mv .ai/initiatives/<name>.md .ai/initiatives/_archived/_pending/<name>.md`

Archive comment: `<!-- Archived YYYY-MM-DD: disposition=pending … -->`. Remove from Active. Add `ARCHIVE.md` **Pending** row.

## Park → backlog (`_archived/_backlog/`)

Future / not started.

Same move pattern into `_backlog/`. `ARCHIVE.md` **Backlog** row.

## Complete (`_archived/_completed/`)

Scope delivered (~100%). Tie shipped work to `CHANGELOG.md` when code actually shipped.

`git mv` into `_completed/`. Archive comment with what shipped (optional version). Remove from Active. Add `ARCHIVE.md` **Completed** row (or the Completed name list on `_index.md`).

## Abandon (`_archived/_abandoned/`)

Will not pursue. Keep the file. One-line **why** on the `ARCHIVE.md` row.

---

Buckets: `_pending/` paused, `_backlog/` future, `_completed/` delivered, `_abandoned/` will not finish.

Related: [`load-context.md`](load-context.md) · [`ship.md`](ship.md)

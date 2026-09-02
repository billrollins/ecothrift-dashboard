<!-- Last updated: 2026-08-27 -->
# Protocol: Clean-up

Two passes. Do not invent a third.

**Pass A — IF** this file is `@`-mentioned **OR** the user says clean-up / cleanup, **and** the message is not a pasted path list
**THEN** scan, print the list, **STOP**.

**Pass B — IF** the user pastes a path list after Pass A in this chat
**THEN** delete every remaining path on that paste. Do not delete lines they removed.

---

## Pass A — list

Scan the repo root. Skip these directories entirely: `.git`, `venv`, `node_modules`, `frontend/dist`, `frontend-public/dist`, `staticfiles`, `__pycache__`, `.pytest_cache`, `.cursor`, `.idea`, `.vscode`.

Collect **files** (not folders) that match any rule. Deduplicate. Sort by path.

| Category | Include when |
|----------|----------------|
| **Temp** | Name ends in `.tmp`, `.temp`, `.swp`, `.swo`, or is `.DS_Store` / `Thumbs.db` |
| **Backup** | Name ends in `.bak`, `.orig`, `.old`, `~`, or contains `.bak.` |
| **Scratch** | Untracked file at repo root; or under `workspace/` and **not** a tracked whitelist file; or name contains `scratch`, `wip`, `todo_local` |
| **Scaffolding** | Name contains `scaffold`, `stub`, `placeholder`, `dummy`, `sample_data` (except `*.example.*` the user already treats as docs) |
| **Legacy** | Name contains `legacy`, `deprecated`, `unused`, `_old`, `-old` |
| **Agent leftover** | Untracked files you (or a prior agent) wrote this session that are not part of the requested feature |

Do not list `.env` or `.envprod`.
Do not list tracked app/source files just because they look old.
Do not list `node_modules` or `venv` contents.

Print **every** hit in chat, in this exact shape, so the user can copy it:

```
CLEAN-UP LIST
(erase any line you want to KEEP, then paste the rest)

Temp
- path/relative/to/repo

Backup
- path/relative/to/repo

Scratch
- path/relative/to/repo

Scaffolding
- path/relative/to/repo

Legacy
- path/relative/to/repo

Agent leftover
- path/relative/to/repo
```

Omit an empty category.
**IF** nothing matched **THEN** say so and STOP.

Then **STOP**. Tell the user: erase the lines to keep, paste the rest, hit enter. Do not delete anything in Pass A.

---

## Pass B — delete

The pasted text is the delete set.

1. Parse `- path` lines (and bare paths, one per line). Ignore headings and blank lines.
2. **IF** a path was not on your Pass A list in this chat **THEN** skip it and say so. Do not delete surprise paths.
3. **IF** the path is `.env` or `.envprod` **THEN** skip it.
4. **IF** the path is a directory **THEN** skip it. This protocol deletes files only.
5. **IF** the file is missing **THEN** skip it and say so.
6. Delete every remaining file.
7. **STOP.** Report deleted paths and skipped paths. Do not commit. Do not start a ship.

**IF** the paste has no file paths **THEN** delete nothing and STOP.

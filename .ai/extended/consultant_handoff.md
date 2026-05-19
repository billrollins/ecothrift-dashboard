<!-- Last updated: 2026-05-18 (no consultant_context; bundle uses context + initiatives) -->
# Consultant handoff — flat bundle and rotation

Optional workflow for **external advisors**. Procedures live here so **`.ai/protocols/`** stays limited to session lifecycle.

## Flat bundle location

Create a **flat** directory (no subfolders):

**`workspace/to_consultant/files-update/`**

Copy files in with **short names** when needed (e.g. `context_copy.md`, `version.txt`).

Git ignores almost all of **`workspace/`**; this path is for **local** handoff ZIPs — nothing here is required for the app to run.

## Mid-session bundle

When Bill asks for a **refreshed advisor snapshot** without a full rotation:

1. Spot-check **`.ai/context.md`**, active initiatives in **`.ai/initiatives/`**, and repo root **`CHANGELOG.md`** (latest dated section + `[Unreleased]`).
2. Copy: **`README.md`**, **`CHANGELOG.md`**, **`.ai/context.md`**, **`.ai/initiatives/_index.md`**, active initiative file(s), **`.version`** (as **`version.txt`** if helpful).
3. Drop into **`workspace/to_consultant/files-update/`** (flat).
4. Optional: **`consultant_instructions.txt`** with read order (start with **`code.0.Startup.md`**).

## Rotation

Incoming advisor: **`.ai/protocols/code.0.Startup.md`**, **`.ai/context.md`**, active initiative, then **`.ai/extended/`** by task.

Outgoing advisor: same bundle as above; zip for email if needed.

## Related

- **`.ai/protocols/session.9.Close.md`** — end-of-session docs + version bump at repo root only.

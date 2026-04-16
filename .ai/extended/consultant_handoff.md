<!-- Last updated: 2026-04-16T22:00:00-05:00 (review_bump — timestamp on line 1) -->
# Consultant handoff — flat bundle and rotation

This file absorbs the former **`collect_for_consultant`** workflow. Procedures live here so **`.ai/protocols/`** stays limited to session lifecycle only.

## Flat bundle location

Create a **flat** directory (no subfolders):

**`workspace/to_consultant/files-update/`**

Everything the consultant opens should be **one directory deep**. Copy files in with **short names** when needed (e.g. `context_copy.md`, `version.txt`).

Git ignores almost all of **`workspace/`**; this path is for **local** handoff ZIPs and advisor drops — nothing here is required for the app to run.

## Mid-session bundle (`collect_for_consultant` workflow)

When Bill asks for a **refreshed consultant snapshot** without a full rotation:

1. Spot-check **`.ai/consultant_context.md`**, active initiatives in **`.ai/initiatives/`**, and **`CHANGELOG.md`** `[Unreleased]` / latest release.
2. Copy the **current** versions of: **`README.md`**, **`CHANGELOG.md`**, **`.ai/consultant_context.md`**, **`.ai/context.md`**, **`.ai/initiatives/_index.md`**, active initiative files, and **`package.json`** / **`.version`** as **`version.txt`** if you track semver for the advisor. (Optional: a short **`consultant_instructions.txt`** listing read order. **`.ai/reference/`** and **`.ai/personas/`** were removed from the repo — do not expect those paths.)
3. Drop them into **`workspace/to_consultant/files-update/`** (flat).
4. Optional: add **`consultant_instructions.txt`** at repo root or beside the bundle describing what to read first.

## Consultant replacement (rotation)

The incoming advisor should read **`.ai/protocols/startup.md`**, **`.ai/consultant_context.md`**, and **`.ai/context.md`**, then deep-link into **`.ai/extended/`** by task. After onboarding, produce the same **flat** bundle so the outgoing advisor can archive it.

## Outgoing consultant

Bundle **`.ai/consultant_context.md`**, initiative index + active initiative files, **`CHANGELOG`**, and **`README`** into **`workspace/to_consultant/files-update/`**; zip for email if needed. Optional prompts / status notes live in **your** copy (there is **no** committed **`handoff_prompt.md`** or **`status_board.md`** under **`.ai/`** after the reference tree cleanup).

## Related

- **`.ai/protocols/session_close.md`** — end-of-session docs + version bump (may reference refreshing advisor-facing copies).
